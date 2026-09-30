// Gap 5 — Trial and Verify: pre-registered comparative trials.
import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../db";
import { requireRole, requireUser } from "../auth";
import { analyzeTrial, type TrialDesign, type Observation } from "../../shared/engine/trial";
import { lockHash } from "../../shared/engine/validation";

export const trials = Router();

const metricZ = z.object({
  key: z.string().max(40), label: z.string().max(80), unit: z.string().max(20), type: z.enum(["continuous", "proportion"]),
  direction: z.enum(["treatment-higher", "treatment-lower"]), minimumDifference: z.number().nonnegative()
});
const designZ = z.object({
  commodityId: z.string(), control: z.string().max(200), treatment: z.string().max(200), conditions: z.string().max(300),
  durationDays: z.number().positive().max(730), checkpointsDays: z.array(z.number().nonnegative()).max(20), unitsPerArm: z.number().int().positive().max(10000),
  primaryMetric: z.string(), metrics: z.array(metricZ).min(1).max(8),
  predictions: z.array(z.object({ metric: z.string(), day: z.number(), predicted: z.number() })).max(60).optional(),
  assessmentId: z.number().optional(), candidateKey: z.string().optional(), expertReviewer: z.string().max(80).optional()
});

trials.post("/trials", requireRole("producer", "expert"), (req, res) => {
  const b = z.object({ title: z.string().min(3).max(120), design: designZ }).parse(req.body);
  if (!b.design.metrics.some((m) => m.key === b.design.primaryMetric)) return res.status(400).json({ error: "Primary metric must be one of the metrics" });
  const r = run("INSERT INTO trials (user_id, assessment_id, title, design_json) VALUES (?, ?, ?, ?)", req.user!.id, b.design.assessmentId ?? null, b.title, JSON.stringify(b.design));
  res.json({ id: Number(r.lastInsertRowid) });
});

trials.get("/trials", requireUser, (req, res) => {
  const rows = ["admin", "expert"].includes(req.user!.role) ? all("SELECT * FROM trials ORDER BY id DESC") : all("SELECT * FROM trials WHERE user_id = ? ORDER BY id DESC", req.user!.id);
  res.json(rows.map((t) => ({ id: t.id, title: t.title, status: t.status, lockedAt: t.locked_at, lockHash: t.lock_hash, createdAt: t.created_at, design: JSON.parse(t.design_json), observations: JSON.parse(t.observations_json).length })));
});

function loadTrial(id: number, user: any) {
  const t = get("SELECT * FROM trials WHERE id = ?", id);
  if (!t || (t.user_id !== user.id && !["admin", "expert"].includes(user.role))) return null;
  return t;
}

trials.get("/trials/:id", requireUser, (req, res) => {
  const t = loadTrial(Number(req.params.id), req.user!);
  if (!t) return res.status(404).json({ error: "Trial not found" });
  const design = JSON.parse(t.design_json) as TrialDesign;
  const observations = JSON.parse(t.observations_json) as Observation[];
  const integrity = t.lock_hash ? lockHash(design) === t.lock_hash : null;
  res.json({ id: t.id, title: t.title, status: t.status, lockedAt: t.locked_at, lockHash: t.lock_hash, integrity, design, observations, analysis: t.locked_at ? analyzeTrial(design, observations) : null });
});

trials.put("/trials/:id", requireUser, (req, res) => {
  const t = loadTrial(Number(req.params.id), req.user!);
  if (!t) return res.status(404).json({ error: "Trial not found" });
  if (t.locked_at) return res.status(409).json({ error: "This trial plan is locked. Thresholds cannot be changed after pre-registration." });
  const b = z.object({ title: z.string().min(3).max(120), design: designZ }).parse(req.body);
  run("UPDATE trials SET title = ?, design_json = ? WHERE id = ?", b.title, JSON.stringify(b.design), t.id);
  res.json({ ok: true });
});

trials.post("/trials/:id/lock", requireUser, (req, res) => {
  const t = loadTrial(Number(req.params.id), req.user!);
  if (!t) return res.status(404).json({ error: "Trial not found" });
  if (t.locked_at) return res.status(409).json({ error: "Already locked" });
  const design = JSON.parse(t.design_json);
  const hash = lockHash(design);
  run("UPDATE trials SET locked_at = ?, lock_hash = ?, status = 'running' WHERE id = ?", new Date().toISOString(), hash, t.id);
  res.json({ lockHash: hash });
});

trials.post("/trials/:id/observations", requireUser, (req, res) => {
  const t = loadTrial(Number(req.params.id), req.user!);
  if (!t) return res.status(404).json({ error: "Trial not found" });
  if (!t.locked_at) return res.status(409).json({ error: "Lock (pre-register) the trial plan before recording results." });
  const obs = z.array(z.object({
    arm: z.enum(["control", "treatment"]), metric: z.string(), day: z.number().nonnegative(), value: z.number(),
    n: z.number().int().positive().optional(), sampleId: z.string().max(40).optional(), note: z.string().max(200).optional()
  })).min(1).max(500).parse(req.body.observations);
  const design = JSON.parse(t.design_json) as TrialDesign;
  for (const o of obs) if (!design.metrics.some((m) => m.key === o.metric)) return res.status(400).json({ error: `Unknown metric ${o.metric}` });
  const existing = JSON.parse(t.observations_json);
  const stamped = obs.map((o) => ({ ...o, recordedAt: new Date().toISOString() }));
  run("UPDATE trials SET observations_json = ? WHERE id = ?", JSON.stringify([...existing, ...stamped]), t.id);
  res.json({ ok: true, total: existing.length + stamped.length });
});

trials.post("/trials/:id/complete", requireUser, (req, res) => {
  const t = loadTrial(Number(req.params.id), req.user!);
  if (!t || !t.locked_at) return res.status(400).json({ error: "Trial must be locked first" });
  run("UPDATE trials SET status = 'completed' WHERE id = ?", t.id);
  res.json({ ok: true });
});
