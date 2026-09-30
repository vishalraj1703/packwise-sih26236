import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { all, get, run } from "../db";
import { createSession, destroySession, hashPassword, requireRole, requireUser, verifyPassword } from "../auth";
import { analyzeJourney, geocode } from "../journeyService";
import { recommend, type AssessmentInput } from "../../shared/engine/recommend";
import { compact, compareSelected } from "../../shared/engine/reassess";
import { aiAvailable, AiError, extractReport, groundedAnswer, identifyFood } from "../ai";
import { search } from "../../shared/engine/retrieval";
import { LIBRARY_UPDATED } from "../../shared/data/knowledge";
import { offlineJourney } from "../../shared/engine/journey";
import { STRUCTURES } from "../../shared/data/materials";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const core = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

// ---------------- auth ----------------
const cookieOpts = (expires: string) => `Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}`;

core.post("/auth/login", (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = get("SELECT * FROM users WHERE email = ?", email.toLowerCase());
  if (!u || !verifyPassword(password, u.salt, u.password_hash)) return res.status(401).json({ error: "Email or password is incorrect" });
  const s = createSession(u.id);
  res.setHeader("Set-Cookie", `pw_session=${s.token}; ${cookieOpts(s.expires)}`);
  res.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, org: u.org } });
});

core.post("/auth/register", (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2), org: z.string().optional() }).parse(req.body);
  if (get("SELECT id FROM users WHERE email = ?", body.email.toLowerCase())) return res.status(409).json({ error: "An account with this email exists" });
  const { hash, salt } = hashPassword(body.password);
  // Self-registration creates producer accounts; other roles are assigned by an admin.
  const r = run("INSERT INTO users (email, name, role, org, password_hash, salt) VALUES (?, ?, 'producer', ?, ?, ?)", body.email.toLowerCase(), body.name, body.org ?? null, hash, salt);
  const s = createSession(Number(r.lastInsertRowid));
  res.setHeader("Set-Cookie", `pw_session=${s.token}; ${cookieOpts(s.expires)}`);
  res.json({ user: { id: Number(r.lastInsertRowid), email: body.email.toLowerCase(), name: body.name, role: "producer", org: body.org ?? null } });
});

core.post("/auth/logout", (req, res) => {
  const cookie = req.headers.cookie?.split(";").map((c) => c.trim()).find((c) => c.startsWith("pw_session="));
  if (cookie) destroySession(decodeURIComponent(cookie.slice(11)));
  res.setHeader("Set-Cookie", "pw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

core.get("/auth/me", (req, res) => res.json({ user: req.user ?? null }));

core.get("/users", requireRole("producer", "expert"), (_req, res) => {
  res.json(all("SELECT id, name, role, org FROM users WHERE role IN ('transporter','retailer') ORDER BY role, name"));
});

// ---------------- status ----------------
core.get("/status", (_req, res) => res.json({ ai: aiAvailable(), libraryUpdated: LIBRARY_UPDATED, time: new Date().toISOString() }));

// ---------------- journey ----------------
core.get("/geocode", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json([]);
  try { res.json(await geocode(q)); } catch { res.status(503).json({ error: "Place search unavailable (offline?). Enter coordinates or pick a saved place." }); }
});

const placeZ = z.object({ name: z.string(), lat: z.number(), lon: z.number(), state: z.string().optional() });
core.post("/journey/analyze", async (req, res) => {
  const b = z.object({ origin: placeZ, destination: placeZ, departureDate: z.string(), storageDays: z.number().min(0).max(730) }).parse(req.body);
  try {
    res.json(await analyzeJourney(b.origin, b.destination, b.departureDate, b.storageDays));
  } catch (e) {
    res.json(offlineJourney(b.origin, b.destination, b.departureDate));
  }
});

// ---------------- assessments ----------------
function parseInput(body: unknown): AssessmentInput {
  // The engine validates semantics; here we guard shape and size.
  const s = z.object({
    commodityId: z.string(),
    state: z.string(),
    identification: z.object({ method: z.enum(["photo-ai", "user-select"]), confirmed: z.boolean(), confidence: z.number().optional() }),
    portions: z.array(z.object({
      id: z.string(), label: z.string().max(80), kg: z.number().positive().max(100000), use: z.enum(["bulk", "retail"]),
      storageDays: z.number().min(0).max(730),
      storage: z.object({ type: z.enum(["ambient-room", "cool-room", "cold-room", "retail-shelf"]), tC: z.number().optional(), rhPct: z.number().optional(), status: z.enum(["measured", "user", "assumed"]) }),
      packSizeKg: z.number().positive().nullable().optional()
    })).min(1).max(6),
    properties: z.any(),
    equipment: z.array(z.string()),
    budgetInrPerKg: z.number().positive().optional(),
    journey: z.any(),
    userState: z.string().optional(),
    costSettings: z.any().optional()
  });
  return s.parse(body) as unknown as AssessmentInput;
}

core.post("/assessments/compute", (req, res) => {
  const input = parseInput(req.body);
  res.json(recommend(input));
});

core.post("/assessments", requireUser, (req, res) => {
  const { input, title } = z.object({ input: z.any(), title: z.string().max(120).optional() }).parse(req.body);
  const parsed = parseInput(input);
  const result = compact(recommend(parsed));
  const r = run("INSERT INTO assessments (user_id, title, commodity_id, input_json, result_json, engine_version) VALUES (?, ?, ?, ?, ?, ?)",
    req.user!.id, title ?? `${result.commodity.name} — ${parsed.journey.origin.name} to ${parsed.journey.destination.name}`, parsed.commodityId, JSON.stringify(parsed), JSON.stringify(result), result.engineVersion);
  res.json({ id: Number(r.lastInsertRowid), result });
});

core.get("/assessments", requireUser, (req, res) => {
  const rows = req.user!.role === "admin" || req.user!.role === "expert"
    ? all("SELECT id, title, commodity_id, engine_version, selected_plan_id, parent_id, created_at FROM assessments ORDER BY id DESC LIMIT 200")
    : all("SELECT id, title, commodity_id, engine_version, selected_plan_id, parent_id, created_at FROM assessments WHERE user_id = ? ORDER BY id DESC", req.user!.id);
  res.json(rows);
});

function loadAssessment(id: number, userId: number, role: string) {
  const row = get("SELECT * FROM assessments WHERE id = ?", id);
  if (!row) return null;
  if (row.user_id !== userId && role !== "admin" && role !== "expert") return null;
  return { id: row.id, title: row.title, input: JSON.parse(row.input_json), result: JSON.parse(row.result_json), selectedPlanId: row.selected_plan_id, parentId: row.parent_id, createdAt: row.created_at };
}

core.get("/assessments/:id", requireUser, (req, res) => {
  const a = loadAssessment(Number(req.params.id), req.user!.id, req.user!.role);
  if (!a) return res.status(404).json({ error: "Assessment not found" });
  res.json(a);
});

core.post("/assessments/:id/select", requireUser, (req, res) => {
  const { planId } = z.object({ planId: z.string() }).parse(req.body);
  const a = loadAssessment(Number(req.params.id), req.user!.id, req.user!.role);
  if (!a) return res.status(404).json({ error: "Assessment not found" });
  if (!a.result.plans.some((p: any) => p.id === planId)) return res.status(400).json({ error: "Unknown plan" });
  run("UPDATE assessments SET selected_plan_id = ? WHERE id = ?", planId, a.id);
  res.json({ ok: true });
});

/** Reassess with changed conditions; stores a child assessment and returns the comparison. */
core.post("/assessments/:id/reassess", requireUser, (req, res) => {
  const a = loadAssessment(Number(req.params.id), req.user!.id, req.user!.role);
  if (!a) return res.status(404).json({ error: "Assessment not found" });
  const changes = z.object({ input: z.any(), note: z.string().max(200).optional() }).parse(req.body);
  const input = parseInput({ ...a.input, ...changes.input });
  const before = a.result;
  const after = compact(recommend(input));
  const planId = a.selectedPlanId ?? before.plans[0]?.id;
  // selections carry transport id in candidate keys; compare within the same transport
  const comparison = compareSelected(before, after, planId);
  const r = run("INSERT INTO assessments (user_id, title, commodity_id, input_json, result_json, engine_version, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    req.user!.id, `${a.title} — reassessed${changes.note ? `: ${changes.note}` : ""}`, input.commodityId, JSON.stringify(input), JSON.stringify(after), after.engineVersion, a.id);
  res.json({ id: Number(r.lastInsertRowid), comparison, result: after });
});

// ---------------- AI ----------------
function aiErr(res: any, e: unknown) {
  if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
  console.error(e);
  return res.status(500).json({ error: "Unexpected AI error" });
}

core.post("/ai/identify", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Attach a photo" });
  const mt = req.file.mimetype as any;
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mt)) return res.status(400).json({ error: "Use a JPEG, PNG or WebP photo" });
  try { res.json(await identifyFood(req.file.buffer.toString("base64"), mt)); } catch (e) { aiErr(res, e); }
});

core.post("/ai/extract", upload.single("report"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Attach a report (PDF or image)" });
  const mt = req.file.mimetype;
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mt)) return res.status(400).json({ error: "Use a PDF or image" });
  try { res.json(await extractReport(req.file.buffer.toString("base64"), mt)); } catch (e) { aiErr(res, e); }
});

core.post("/ai/chat", async (req, res) => {
  const b = z.object({
    question: z.string().min(1).max(2000),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
    context: z.string().max(6000).default(""),
    language: z.string().max(20).default("English")
  }).parse(req.body);
  const hits = search(b.question, 4);
  const passages = hits.map((h) => ({ id: h.article.id, title: h.article.title, text: h.article.text, updated: LIBRARY_UPDATED }));
  try {
    const answer = await groundedAnswer(b.question, b.history, passages, b.context, b.language);
    res.json({ answer, passages: passages.map(({ id, title }) => ({ id, title })), mode: "online" });
  } catch (e) { aiErr(res, e); }
});

// ---------------- expert review of seed data ----------------
core.get("/reviews", (_req, res) => {
  res.json(all("SELECT r.*, u.name AS reviewer FROM reviews r LEFT JOIN users u ON u.id = r.reviewer_id ORDER BY r.id DESC"));
});
core.post("/reviews", requireRole("expert"), (req, res) => {
  const b = z.object({ entity: z.enum(["commodity", "material", "structure", "article", "rule"]), entityId: z.string(), decision: z.enum(["approved", "needs-change", "rejected"]), notes: z.string().max(2000).optional() }).parse(req.body);
  const r = run("INSERT INTO reviews (entity, entity_id, reviewer_id, decision, notes) VALUES (?, ?, ?, ?, ?)", b.entity, b.entityId, req.user!.id, b.decision, b.notes ?? null);
  res.json({ id: Number(r.lastInsertRowid) });
});

// ---------------- verified real-life examples (reviewer-curated) ----------------
const EXAMPLE_DIR = path.resolve(process.env.PACKWISE_UPLOAD_DIR ?? "uploads", "examples");
fs.mkdirSync(EXAMPLE_DIR, { recursive: true });
const exampleUpload = multer({
  storage: multer.diskStorage({ destination: EXAMPLE_DIR, filename: (_r, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "")}`) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_r, f, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(f.mimetype))
});

core.get("/examples", (_req, res) => {
  res.json(all("SELECT e.*, u.name AS reviewer FROM verified_examples e LEFT JOIN users u ON u.id = e.reviewer_id ORDER BY e.id DESC"));
});

core.post("/examples", requireRole("expert"), exampleUpload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A product photo (JPEG/PNG/WebP) is required" });
  const b = z.object({
    structureId: z.string(), commodityId: z.string().optional(), product: z.string().min(2).max(120), brand: z.string().min(1).max(80),
    photoSource: z.string().min(3).max(300), documentedStructure: z.string().min(3).max(300), structureSource: z.string().min(3).max(300),
    labelledShelfLife: z.string().max(120).optional(), storageInstructions: z.string().max(300).optional(), sourceDate: z.string().min(8).max(20)
  }).parse(req.body);
  if (!STRUCTURES.some((s) => s.id === b.structureId)) return res.status(400).json({ error: "Unknown structure" });
  const r = run(`INSERT INTO verified_examples (structure_id, commodity_id, product, brand, photo_path, photo_source, documented_structure, structure_source, labelled_shelf_life, storage_instructions, source_date, reviewer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, b.structureId, b.commodityId || null, b.product, b.brand, `/uploads/examples/${req.file.filename}`, b.photoSource, b.documentedStructure, b.structureSource,
    b.labelledShelfLife || null, b.storageInstructions || null, b.sourceDate, req.user!.id);
  res.json({ id: Number(r.lastInsertRowid) });
});

core.delete("/examples/:id", requireRole("expert"), (req, res) => {
  run("DELETE FROM verified_examples WHERE id = ?", Number(req.params.id));
  res.json({ ok: true });
});
