// Sourcing, packing records, QR traceability, shipments, simulated retail
// billing and consumer issues (discussion record pp.7–8).
import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import QRCode from "qrcode";
import { z } from "zod";
import { all, get, run, tx } from "../db";
import { requireRole, requireUser, sha256, userFromApiKey } from "../auth";
import { SUPPLIER_PRODUCTS, SUPPLIERS, getSupplier } from "../../shared/data/suppliers";
import { getCommodity } from "../../shared/data/commodities";
import { getStructure, plainName } from "../../shared/data/materials";
import { recyclability } from "../../shared/engine/barrier";

export const trace = Router();
const UPLOAD_DIR = path.resolve(process.env.PACKWISE_UPLOAD_DIR ?? "uploads", "complaints");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_r, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "")}`) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_r, f, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(f.mimetype))
});

const token = () => crypto.randomBytes(8).toString("base64url");
const nowIso = () => new Date().toISOString();
const baseUrl = (req: any) => process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get("x-forwarded-host") ?? req.get("host")}`;

// ---------------- sourcing ----------------
trace.get("/suppliers", (_req, res) => res.json({ suppliers: SUPPLIERS, products: SUPPLIER_PRODUCTS }));

trace.post("/quotes", requireUser, (req, res) => {
  const b = z.object({
    assessmentId: z.number().optional(), supplierId: z.string(), supplierProductId: z.string().optional(),
    kind: z.enum(["quotation", "sample", "packing-service"]), units: z.number().int().positive().max(1e6), sizeKg: z.number().positive().optional(), message: z.string().max(1000).optional()
  }).parse(req.body);
  const sup = getSupplier(b.supplierId);
  if (!sup) return res.status(404).json({ error: "Unknown supplier" });
  const validUntil = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  let response: Record<string, unknown>;
  if (b.kind === "packing-service") {
    const ps = sup.packingService;
    if (!ps) return res.status(400).json({ error: "This supplier does not offer packing services" });
    response = { simulated: true, pricePerPackInr: ps.pricePerPackInr, minChargeInr: ps.minChargeInr, totalInr: Math.max(ps.minChargeInr, ps.pricePerPackInr * b.units), methods: ps.methods, validUntil, note: "Simulated quotation — no booking has been made." };
  } else {
    const p = SUPPLIER_PRODUCTS.find((x) => x.id === b.supplierProductId && x.supplierId === b.supplierId);
    if (!p || !b.sizeKg || !p.unitPriceInr[String(b.sizeKg)]) return res.status(400).json({ error: "Product/size not offered by this supplier" });
    const unit = p.unitPriceInr[String(b.sizeKg)];
    if (b.kind === "sample") {
      const n = Math.min(b.units, 10);
      response = { simulated: true, sampleUnits: n, chargeInr: n <= 5 ? 0 : (n - 5) * unit, courierInr: 120, dispatchDays: 3, documentation: p.documentation, declared: p.declared, validUntil, note: "Simulated sample request — nothing has been ordered." };
    } else {
      const buy = Math.max(b.units, p.moqUnits);
      response = { simulated: true, unitPriceInr: unit, unitsQuoted: buy, moqUnits: p.moqUnits, setupCostInr: p.setupCostInr, leadTimeDays: p.leadTimeDays, subtotalInr: buy * unit + p.setupCostInr, gstPct: 18, documentation: p.documentation, declared: p.declared, substitutionTerms: "No material substitution without written approval (requested).", validUntil, note: "Simulated quotation — no purchase has been made." };
    }
  }
  const r = run("INSERT INTO quote_requests (user_id, assessment_id, supplier_id, supplier_product_id, kind, units, size_kg, message, response_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    req.user!.id, b.assessmentId ?? null, b.supplierId, b.supplierProductId ?? null, b.kind, b.units, b.sizeKg ?? null, b.message ?? null, JSON.stringify(response));
  res.json({ id: Number(r.lastInsertRowid), supplier: sup.name, response });
});

trace.get("/quotes", requireUser, (req, res) => {
  res.json(all("SELECT * FROM quote_requests WHERE user_id = ? ORDER BY id DESC", req.user!.id).map((q) => ({ ...q, response: JSON.parse(q.response_json ?? "{}"), supplier: getSupplier(q.supplier_id)?.name })));
});

trace.post("/material-lots", requireRole("producer"), (req, res) => {
  const b = z.object({
    supplierProductId: z.string(), lotCode: z.string().min(2).max(40), receivedAt: z.string(), unitsReceived: z.number().int().positive(),
    checks: z.object({ technicalMatch: z.boolean(), dimensionsOk: z.boolean(), lotMatchesOrder: z.boolean(), sampleSealOk: z.boolean(), documentsReceived: z.boolean(), notes: z.string().max(1000).optional() })
  }).parse(req.body);
  if (!SUPPLIER_PRODUCTS.some((p) => p.id === b.supplierProductId)) return res.status(400).json({ error: "Unknown supplier product" });
  const accepted = b.checks.technicalMatch && b.checks.dimensionsOk && b.checks.lotMatchesOrder && b.checks.sampleSealOk;
  const r = run("INSERT INTO material_lots (user_id, supplier_product_id, lot_code, received_at, units_received, receiving_check_json, accepted) VALUES (?, ?, ?, ?, ?, ?, ?)",
    req.user!.id, b.supplierProductId, b.lotCode, b.receivedAt, b.unitsReceived, JSON.stringify(b.checks), accepted ? 1 : 0);
  res.json({ id: Number(r.lastInsertRowid), accepted });
});

trace.get("/material-lots", requireUser, (req, res) => {
  const rows = req.user!.role === "admin" || req.user!.role === "expert" ? all("SELECT * FROM material_lots ORDER BY id DESC") : all("SELECT * FROM material_lots WHERE user_id = ? ORDER BY id DESC", req.user!.id);
  res.json(rows.map((l) => {
    const p = SUPPLIER_PRODUCTS.find((x) => x.id === l.supplier_product_id);
    return { ...l, checks: JSON.parse(l.receiving_check_json), structureId: p?.structureId, structureName: p ? getStructure(p.structureId).name : "?", supplier: p ? getSupplier(p.supplierId).name : "?" };
  }));
});

// ---------------- batches ----------------
function batchCode(commodityId: string) {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const n = (get("SELECT COUNT(*) AS n FROM batches")?.n ?? 0) + 1;
  return `PW${ymd}-${commodityId.slice(0, 3).toUpperCase()}-${String(n).padStart(4, "0")}`;
}

trace.post("/batches", requireRole("producer"), (req, res) => {
  const b = z.object({
    assessmentId: z.number().optional(), candidateKey: z.string().optional(), materialLotId: z.number().optional(),
    commodityId: z.string(), state: z.string().optional(), origin: z.string().max(120), harvestDate: z.string().optional(), packedAt: z.string(),
    quantityKg: z.number().positive(), units: z.number().int().positive().max(100000), packSizeKg: z.number().positive(),
    structureId: z.string(), oxygenControl: z.string().optional(), gtin: z.string().regex(/^\d{8,14}$/).optional(),
    packingChecks: z.record(z.string(), z.any())
  }).parse(req.body);
  const warnings: string[] = [];
  let recVersion: string | null = null;
  if (b.assessmentId) {
    const a = get("SELECT * FROM assessments WHERE id = ? AND user_id = ?", b.assessmentId, req.user!.id);
    if (!a) return res.status(404).json({ error: "Assessment not found" });
    recVersion = `${a.engine_version} / assessment #${a.id}`;
    const result = JSON.parse(a.result_json);
    const cand = result.portions.flatMap((p: any) => p.candidates).find((c: any) => c.key === b.candidateKey);
    if (cand && cand.structureId !== b.structureId) warnings.push(`Packaging actually used (${getStructure(b.structureId).name}) differs from the recommended option (${cand.structureName}). The recommendation does not apply to this batch.`);
  }
  let supplierProductId: string | null = null;
  if (b.materialLotId) {
    const lot = get("SELECT * FROM material_lots WHERE id = ? AND user_id = ?", b.materialLotId, req.user!.id);
    if (!lot) return res.status(404).json({ error: "Material lot not found" });
    supplierProductId = lot.supplier_product_id;
    const p = SUPPLIER_PRODUCTS.find((x) => x.id === lot.supplier_product_id)!;
    if (p.structureId !== b.structureId) warnings.push("The selected material lot is a different structure from the one recorded for this batch.");
    if (!lot.accepted) warnings.push("This material lot did not pass the receiving check.");
  } else warnings.push("No supplier material lot linked — defective-lot investigation will not be possible for this batch.");
  const c = getCommodity(b.commodityId);
  const s = getStructure(b.structureId);
  const handling = {
    storage: c.storageAdvice,
    disposal: recyclability(s).label,
    pwmCategory: recyclability(s).pwmCategory,
    packaging: s.name,
    oxygenControl: b.oxygenControl ?? "none"
  };
  const code = batchCode(b.commodityId);
  const t = token();
  const id = tx(() => {
    const r = run(`INSERT INTO batches (public_token, batch_code, gtin, producer_id, assessment_id, candidate_key, recommendation_version, commodity_id, commodity_name, state, origin, harvest_date, packed_at, quantity_kg, units, pack_size_kg, structure_id, structure_name, oxygen_control, material_lot_id, supplier_product_id, packing_checks_json, handling_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t, code, b.gtin ?? null, req.user!.id, b.assessmentId ?? null, b.candidateKey ?? null, recVersion, c.id, c.name, b.state ?? c.defaultState, b.origin, b.harvestDate ?? null, b.packedAt,
      b.quantityKg, b.units, b.packSizeKg, s.id, s.name, b.oxygenControl ?? "none", b.materialLotId ?? null, supplierProductId, JSON.stringify(b.packingChecks), JSON.stringify(handling));
    const id = Number(r.lastInsertRowid);
    run("INSERT INTO events (type, batch_id, actor_id, actor_role, event_time, location, units, notes) VALUES ('packed', ?, ?, ?, ?, ?, ?, ?)", id, req.user!.id, req.user!.role, b.packedAt, b.origin, b.units, warnings.join(" ") || null);
    return id;
  });
  res.json({ id, batchCode: code, publicToken: t, publicUrl: `${baseUrl(req)}/t/${t}`, warnings });
});

function canSeeBatch(user: any, batch: any) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "expert" || batch.producer_id === user.id) return true;
  // transporters/retailers see batches in shipments assigned to them
  return !!get("SELECT 1 FROM shipment_batches sb JOIN shipments s ON s.id = sb.shipment_id WHERE sb.batch_id = ? AND (s.transporter_id = ? OR s.receiver_id = ?)", batch.id, user.id, user.id);
}

trace.get("/batches", requireUser, (req, res) => {
  const u = req.user!;
  const rows = u.role === "admin" || u.role === "expert"
    ? all("SELECT * FROM batches ORDER BY id DESC")
    : u.role === "producer" ? all("SELECT * FROM batches WHERE producer_id = ? ORDER BY id DESC", u.id)
    : all("SELECT DISTINCT b.* FROM batches b JOIN shipment_batches sb ON sb.batch_id = b.id JOIN shipments s ON s.id = sb.shipment_id WHERE s.transporter_id = ? OR s.receiver_id = ? ORDER BY b.id DESC", u.id, u.id);
  res.json(rows.map((b) => ({ ...b, complaints: get("SELECT COUNT(*) AS n FROM complaints WHERE batch_id = ?", b.id)?.n ?? 0 })));
});

trace.get("/batches/:id", requireUser, (req, res) => {
  const b = get("SELECT * FROM batches WHERE id = ?", Number(req.params.id));
  if (!b || !canSeeBatch(req.user, b)) return res.status(404).json({ error: "Batch not found" });
  const events = all("SELECT e.*, u.name AS actor_name FROM events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.batch_id = ? OR e.shipment_id IN (SELECT shipment_id FROM shipment_batches WHERE batch_id = ?) ORDER BY e.event_time, e.id", b.id, b.id);
  const shipments = all("SELECT s.*, sb.units, t.name AS transporter, r.name AS receiver FROM shipment_batches sb JOIN shipments s ON s.id = sb.shipment_id LEFT JOIN users t ON t.id = s.transporter_id LEFT JOIN users r ON r.id = s.receiver_id WHERE sb.batch_id = ?", b.id);
  const children = all("SELECT id, batch_code, units, quantity_kg FROM batches WHERE parent_batch_id = ?", b.id);
  const parent = b.parent_batch_id ? get("SELECT id, batch_code FROM batches WHERE id = ?", b.parent_batch_id) : null;
  const lot = b.material_lot_id ? get("SELECT * FROM material_lots WHERE id = ?", b.material_lot_id) : null;
  const sales = all("SELECT * FROM retail_sales WHERE batch_id = ? ORDER BY sold_at DESC", b.id);
  const complaints = b.producer_id === req.user!.id || ["admin", "expert"].includes(req.user!.role) ? all("SELECT * FROM complaints WHERE batch_id = ? ORDER BY id DESC", b.id) : [];
  res.json({ batch: { ...b, packingChecks: JSON.parse(b.packing_checks_json ?? "{}"), handling: JSON.parse(b.handling_json ?? "{}") }, events, shipments, children, parent, lot, sales, complaints, publicUrl: `${baseUrl(req)}/t/${b.public_token}` });
});

trace.get("/qr/:token.svg", async (req, res) => {
  const b = get("SELECT public_token FROM batches WHERE public_token = ?", req.params.token);
  if (!b) return res.status(404).end();
  const svg = await QRCode.toString(`${baseUrl(req)}/t/${b.public_token}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b2f30", light: "#ffffff" } });
  res.type("image/svg+xml").send(svg);
});

trace.post("/batches/:id/split", requireRole("producer", "retailer"), (req, res) => {
  const b = get("SELECT * FROM batches WHERE id = ?", Number(req.params.id));
  if (!b || !canSeeBatch(req.user, b)) return res.status(404).json({ error: "Batch not found" });
  const { parts, reason } = z.object({ parts: z.array(z.object({ units: z.number().int().positive(), note: z.string().max(200).optional() })).min(2).max(10), reason: z.enum(["split", "repack"]) }).parse(req.body);
  const total = parts.reduce((a, p) => a + p.units, 0);
  if (total > b.units) return res.status(400).json({ error: `Parts add up to ${total} units but the batch has ${b.units}` });
  const created = tx(() => parts.map((p, i) => {
    const code = `${b.batch_code}-${String.fromCharCode(65 + i)}`;
    const r = run(`INSERT INTO batches (public_token, batch_code, gtin, producer_id, assessment_id, candidate_key, recommendation_version, commodity_id, commodity_name, state, origin, harvest_date, packed_at, quantity_kg, units, pack_size_kg, structure_id, structure_name, oxygen_control, material_lot_id, supplier_product_id, packing_checks_json, handling_json, parent_batch_id)
      SELECT ?, ?, gtin, producer_id, assessment_id, candidate_key, recommendation_version, commodity_id, commodity_name, state, origin, harvest_date, packed_at, ?, ?, pack_size_kg, structure_id, structure_name, oxygen_control, material_lot_id, supplier_product_id, packing_checks_json, handling_json, id FROM batches WHERE id = ?`,
      token(), code, p.units * b.pack_size_kg, p.units, b.id);
    const id = Number(r.lastInsertRowid);
    run("INSERT INTO events (type, batch_id, actor_id, actor_role, event_time, units, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", reason, id, req.user!.id, req.user!.role, nowIso(), p.units, `From ${b.batch_code}${p.note ? `: ${p.note}` : ""}`);
    return { id, code };
  }));
  run("INSERT INTO events (type, batch_id, actor_id, actor_role, event_time, units, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", reason, b.id, req.user!.id, req.user!.role, nowIso(), total, `Into ${created.map((c) => c.code).join(", ")}`);
  res.json({ created });
});

// ---------------- shipments ----------------
trace.post("/shipments", requireRole("producer"), (req, res) => {
  const b = z.object({
    origin: z.string().max(120), destination: z.string().max(120), transporterId: z.number().optional(), receiverId: z.number().optional(),
    declaredConditions: z.object({ vehicle: z.string(), temperature: z.string().optional(), notes: z.string().max(500).optional() }),
    batches: z.array(z.object({ batchId: z.number(), units: z.number().int().positive() })).min(1)
  }).parse(req.body);
  for (const x of b.batches) {
    const bt = get("SELECT * FROM batches WHERE id = ? AND producer_id = ?", x.batchId, req.user!.id);
    if (!bt) return res.status(404).json({ error: `Batch ${x.batchId} not found` });
    const shipped = get("SELECT COALESCE(SUM(units),0) AS n FROM shipment_batches WHERE batch_id = ?", x.batchId)?.n ?? 0;
    if (shipped + x.units > bt.units) return res.status(400).json({ error: `Only ${bt.units - shipped} units of ${bt.batch_code} remain unshipped` });
  }
  const code = `SH-${Date.now().toString(36).toUpperCase()}`;
  const id = tx(() => {
    const r = run("INSERT INTO shipments (code, created_by, origin, destination, transporter_id, receiver_id, declared_conditions_json) VALUES (?, ?, ?, ?, ?, ?, ?)", code, req.user!.id, b.origin, b.destination, b.transporterId ?? null, b.receiverId ?? null, JSON.stringify(b.declaredConditions));
    const id = Number(r.lastInsertRowid);
    for (const x of b.batches) run("INSERT INTO shipment_batches (shipment_id, batch_id, units) VALUES (?, ?, ?)", id, x.batchId, x.units);
    return id;
  });
  res.json({ id, code });
});

trace.get("/shipments", requireUser, (req, res) => {
  const u = req.user!;
  const rows = u.role === "admin" || u.role === "expert" ? all("SELECT * FROM shipments ORDER BY id DESC")
    : all("SELECT * FROM shipments WHERE created_by = ? OR transporter_id = ? OR receiver_id = ? ORDER BY id DESC", u.id, u.id, u.id);
  res.json(rows.map((s) => ({
    ...s,
    declared: JSON.parse(s.declared_conditions_json ?? "{}"),
    batches: all("SELECT b.id, b.batch_code, b.commodity_name, sb.units FROM shipment_batches sb JOIN batches b ON b.id = sb.batch_id WHERE sb.shipment_id = ?", s.id),
    events: all("SELECT type, event_time, location, units, condition_json, notes, actor_role FROM events WHERE shipment_id = ? ORDER BY event_time", s.id)
  })));
});

trace.post("/shipments/:id/events", requireUser, (req, res) => {
  const s = get("SELECT * FROM shipments WHERE id = ?", Number(req.params.id));
  if (!s) return res.status(404).json({ error: "Shipment not found" });
  const b = z.object({
    type: z.enum(["dispatch", "handoff", "receipt", "storage-check"]), location: z.string().max(120).optional(), units: z.number().int().nonnegative().optional(),
    condition: z.object({ damagedUnits: z.number().int().nonnegative().optional(), temperatureC: z.number().optional(), remarks: z.string().max(500).optional() }).optional(),
    time: z.string().optional()
  }).parse(req.body);
  const u = req.user!;
  const isAdmin = u.role === "admin";
  const allowed =
    (b.type === "dispatch" && (s.created_by === u.id || s.transporter_id === u.id)) ||
    (b.type === "handoff" && (s.transporter_id === u.id)) ||
    (b.type === "receipt" && (s.receiver_id === u.id || (s.receiver_id === null && u.role === "retailer"))) ||
    (b.type === "storage-check" && (s.receiver_id === u.id || s.created_by === u.id));
  if (!allowed && !isAdmin) return res.status(403).json({ error: `Your account is not authorised to record '${b.type}' for this shipment` });
  const order = ["created", "dispatched", "in-transit", "received"];
  if (b.type === "receipt" && !["dispatched", "in-transit"].includes(s.status)) return res.status(400).json({ error: "Receipt can only be recorded after dispatch" });
  if (b.type === "handoff" && !["dispatched", "in-transit"].includes(s.status)) return res.status(400).json({ error: "Handoff can only be recorded after dispatch" });
  const shippedUnits = get("SELECT COALESCE(SUM(units),0) AS n FROM shipment_batches WHERE shipment_id = ?", s.id)?.n ?? 0;
  const warnings: string[] = [];
  if (b.type === "receipt" && b.units !== undefined && b.units !== shippedUnits) warnings.push(`Received ${b.units} units but ${shippedUnits} were dispatched — discrepancy recorded.`);
  tx(() => {
    run("INSERT INTO events (type, shipment_id, actor_id, actor_role, event_time, location, units, condition_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      b.type, s.id, u.id, u.role, b.time ?? nowIso(), b.location ?? null, b.units ?? null, b.condition ? JSON.stringify(b.condition) : null);
    const next = b.type === "dispatch" ? "dispatched" : b.type === "handoff" ? "in-transit" : b.type === "receipt" ? "received" : s.status;
    if (order.indexOf(next) >= order.indexOf(s.status)) run("UPDATE shipments SET status = ?, receiver_id = COALESCE(receiver_id, ?) WHERE id = ?", next, b.type === "receipt" ? u.id : null, s.id);
  });
  res.json({ ok: true, warnings });
});

// ---------------- simulated retail billing ----------------
function resolveCode(code: string) {
  const unit = code.match(/^(.*)-U(\d{4,6})$/);
  const batchCode = unit ? unit[1] : code;
  const b = get("SELECT * FROM batches WHERE batch_code = ?", batchCode);
  if (!b) return null;
  if (unit && (Number(unit[2]) < 1 || Number(unit[2]) > b.units)) return { batch: b, unitSerial: null, error: "Unit number outside this batch" };
  return { batch: b, unitSerial: unit ? code : null, error: null as string | null };
}

trace.post("/pos/sale", (req, res) => {
  const user = req.user ?? userFromApiKey(req.get("x-api-key") ?? undefined);
  if (!user || (user.role !== "retailer" && user.role !== "admin")) return res.status(401).json({ error: "Retailer session or X-API-Key required" });
  const b = z.object({ code: z.string().min(3).max(60), quantity: z.number().int().positive().max(1000).default(1), store: z.string().max(120).optional(), gtin: z.string().optional(), soldAt: z.string().optional() }).parse(req.body);
  const r = resolveCode(b.code.trim());
  if (!r) return res.status(404).json({ error: "Code not recognised. A product barcode (GTIN) alone identifies the product type, not the batch — scan the batch/unit QR or enter the batch code." });
  if (r.error) return res.status(400).json({ error: r.error });
  const warnings: string[] = [];
  const received = get("SELECT 1 FROM shipments s JOIN shipment_batches sb ON sb.shipment_id = s.id WHERE sb.batch_id IN (?, ?) AND s.receiver_id = ? AND s.status = 'received'", r.batch.id, r.batch.parent_batch_id ?? -1, user.id);
  if (!received) warnings.push("No recorded receipt of this batch at your store — sale recorded but flagged for review.");
  if (r.unitSerial && get("SELECT 1 FROM retail_sales WHERE unit_serial = ?", r.unitSerial)) warnings.push("This unit was already recorded as sold — possible duplicate scan.");
  const soldAt = b.soldAt ?? nowIso();
  tx(() => {
    run("INSERT INTO retail_sales (retailer_id, batch_id, gtin, batch_code, unit_serial, quantity, store, source, sold_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      user.id, r.batch.id, b.gtin ?? r.batch.gtin, r.batch.batch_code, r.unitSerial, b.quantity, b.store ?? user.org, req.user ? "pos-simulator" : "api", soldAt);
    run("INSERT INTO events (type, batch_id, actor_id, actor_role, event_time, location, units, notes) VALUES ('retail-sale', ?, ?, ?, ?, ?, ?, ?)", r.batch.id, user.id, user.role, soldAt, b.store ?? user.org, b.quantity, r.unitSerial ? `Unit ${r.unitSerial}` : null);
  });
  res.json({ ok: true, batchCode: r.batch.batch_code, commodity: r.batch.commodity_name, unitSerial: r.unitSerial, warnings });
});

trace.get("/pos/sales", requireRole("retailer"), (req, res) => {
  res.json(all("SELECT * FROM retail_sales WHERE retailer_id = ? ORDER BY id DESC LIMIT 200", req.user!.id));
});

trace.post("/pos/api-key", requireRole("retailer"), (req, res) => {
  const key = `pwk_${crypto.randomBytes(18).toString("base64url")}`;
  run("UPDATE users SET api_key_hash = ? WHERE id = ?", sha256(key), req.user!.id);
  res.json({ apiKey: key, note: "Shown once. Send it as the X-API-Key header from your billing software." });
});

// ---------------- consumer issues ----------------
const recent = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const arr = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  arr.push(now);
  recent.set(ip, arr);
  return arr.length > 10;
}

trace.get("/public/batch/:token", (req, res) => {
  // Read-only: a public scan never changes shipment status.
  const b = get("SELECT * FROM batches WHERE public_token = ?", req.params.token);
  if (!b) return res.status(404).json({ error: "This code is not recognised" });
  const producer = get("SELECT org, name FROM users WHERE id = ?", b.producer_id);
  const events = all(`SELECT type, event_time, location, actor_role FROM events WHERE (batch_id = ? OR batch_id = ? OR shipment_id IN (SELECT shipment_id FROM shipment_batches WHERE batch_id IN (?, ?))) AND type IN ('packed','dispatch','handoff','receipt','split','repack') ORDER BY event_time`, b.id, b.parent_batch_id ?? -1, b.id, b.parent_batch_id ?? -1);
  const c = getCommodity(b.commodity_id);
  res.json({
    batchCode: b.batch_code, commodity: b.commodity_name, names: c.names, state: b.state, origin: b.origin, producer: producer?.org ?? "Registered producer",
    packedAt: b.packed_at, harvestDate: b.harvest_date, packaging: b.structure_id ? `${plainName(b.structure_id)} (${b.structure_name})` : b.structure_name, oxygenControl: b.oxygen_control, handling: JSON.parse(b.handling_json ?? "{}"),
    parentBatch: b.parent_batch_id ? get("SELECT batch_code FROM batches WHERE id = ?", b.parent_batch_id)?.batch_code : null,
    events: events.map((e) => ({ type: e.type, time: e.event_time, location: e.location, by: e.actor_role })),
    note: "This page shows packing and handling records. It is not a shelf-life or quality guarantee."
  });
});

trace.post("/public/batch/:token/complaint", upload.array("photos", 3), (req, res) => {
  const b = get("SELECT id, units FROM batches WHERE public_token = ?", req.params.token);
  if (!b) return res.status(404).json({ error: "This code is not recognised" });
  if (rateLimited(req.ip ?? "?")) return res.status(429).json({ error: "Too many reports from this connection — please try later" });
  const body = z.object({
    category: z.enum(["damaged-pack", "leaking-seal", "moisture-soft", "rancid-smell", "mould-insects", "foreign-matter", "wrong-quantity", "other"]),
    description: z.string().min(5).max(2000), unitSerial: z.string().max(40).optional(),
    contactName: z.string().max(80).optional(), contactPhone: z.string().max(20).optional(), contactEmail: z.string().max(120).optional(),
    consent: z.string().optional()
  }).parse(req.body);
  const photos = ((req.files as Express.Multer.File[]) ?? []).map((f) => `/uploads/complaints/${f.filename}`);
  const keepContact = body.consent === "yes";
  const r = run("INSERT INTO complaints (batch_id, unit_serial, category, description, photos_json, contact_name, contact_phone, contact_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    b.id, body.unitSerial ?? null, body.category, body.description, JSON.stringify(photos), keepContact ? body.contactName ?? null : null, keepContact ? body.contactPhone ?? null : null, keepContact ? body.contactEmail ?? null : null);
  res.json({ id: Number(r.lastInsertRowid), message: "Thank you. The producer has been notified and will investigate. A report does not by itself establish the cause." });
});

trace.get("/complaints", requireRole("producer", "expert"), (req, res) => {
  const u = req.user!;
  const rows = u.role === "producer"
    ? all("SELECT c.*, b.batch_code, b.commodity_name, b.material_lot_id FROM complaints c JOIN batches b ON b.id = c.batch_id WHERE b.producer_id = ? ORDER BY c.id DESC", u.id)
    : all("SELECT c.id, c.batch_id, c.unit_serial, c.category, c.description, c.photos_json, c.status, c.manufacturer_notes, c.reviewed, c.created_at, b.batch_code, b.commodity_name, b.material_lot_id FROM complaints c JOIN batches b ON b.id = c.batch_id ORDER BY c.id DESC");
  res.json(rows.map((c) => ({ ...c, photos: JSON.parse(c.photos_json ?? "[]") })));
});

trace.patch("/complaints/:id", requireRole("producer", "expert"), (req, res) => {
  const b = z.object({ status: z.enum(["new", "investigating", "resolved", "not-packaging-related"]).optional(), notes: z.string().max(2000).optional(), reviewed: z.boolean().optional() }).parse(req.body);
  const c = get("SELECT c.*, b.producer_id FROM complaints c JOIN batches b ON b.id = c.batch_id WHERE c.id = ?", Number(req.params.id));
  if (!c || (req.user!.role === "producer" && c.producer_id !== req.user!.id)) return res.status(404).json({ error: "Not found" });
  run("UPDATE complaints SET status = COALESCE(?, status), manufacturer_notes = COALESCE(?, manufacturer_notes), reviewed = COALESCE(?, reviewed) WHERE id = ?", b.status ?? null, b.notes ?? null, b.reviewed === undefined ? null : b.reviewed ? 1 : 0, c.id);
  res.json({ ok: true });
});

/** Clusters suggest investigation; they do not prove packaging caused the problem. */
trace.get("/complaints/clusters", requireRole("producer", "expert"), (req, res) => {
  const u = req.user!;
  const scope = u.role === "producer" ? "AND b.producer_id = ?" : "";
  const params = u.role === "producer" ? [u.id] : [];
  const byBatch = all(`SELECT b.id AS batch_id, b.batch_code, c.category, COUNT(*) AS n FROM complaints c JOIN batches b ON b.id = c.batch_id WHERE c.created_at > datetime('now','-30 days') ${scope} GROUP BY b.id, c.category HAVING n >= 2 ORDER BY n DESC`, ...params);
  const byLot = all(`SELECT b.material_lot_id AS lot_id, m.lot_code, m.supplier_product_id, c.category, COUNT(*) AS n, COUNT(DISTINCT b.id) AS batches FROM complaints c JOIN batches b ON b.id = c.batch_id JOIN material_lots m ON m.id = b.material_lot_id WHERE c.created_at > datetime('now','-30 days') ${scope} GROUP BY b.material_lot_id, c.category HAVING n >= 2 ORDER BY n DESC`, ...params);
  res.json({
    byBatch, byLot: byLot.map((l) => ({ ...l, structure: getStructure(SUPPLIER_PRODUCTS.find((p) => p.id === l.supplier_product_id)!.structureId).name })),
    note: "A cluster of reports suggests an investigation. It does not prove that packaging caused the problem; review reports before using them to improve models."
  });
});

trace.get("/investigate/lot/:id", requireRole("producer", "expert"), (req, res) => {
  const lot = get("SELECT * FROM material_lots WHERE id = ?", Number(req.params.id));
  if (!lot || (req.user!.role === "producer" && lot.user_id !== req.user!.id)) return res.status(404).json({ error: "Lot not found" });
  const batches = all("SELECT id, batch_code, commodity_name, units, packed_at, parent_batch_id FROM batches WHERE material_lot_id = ?", lot.id);
  const ids = batches.map((b) => b.id);
  const q = ids.length ? ids.map(() => "?").join(",") : "-1";
  const shipments = all(`SELECT DISTINCT s.code, s.destination, s.status, sb.batch_id, sb.units FROM shipment_batches sb JOIN shipments s ON s.id = sb.shipment_id WHERE sb.batch_id IN (${q})`, ...ids);
  const sales = all(`SELECT batch_code, store, SUM(quantity) AS units FROM retail_sales WHERE batch_id IN (${q}) GROUP BY batch_code, store`, ...ids);
  const complaints = all(`SELECT category, COUNT(*) AS n FROM complaints WHERE batch_id IN (${q}) GROUP BY category`, ...ids);
  const p = SUPPLIER_PRODUCTS.find((x) => x.id === lot.supplier_product_id)!;
  res.json({ lot: { ...lot, checks: JSON.parse(lot.receiving_check_json), structure: getStructure(p.structureId).name, supplier: getSupplier(p.supplierId).name }, batches, shipments, sales, complaints });
});
