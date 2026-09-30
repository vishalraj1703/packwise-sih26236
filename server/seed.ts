// Demo data for the prototype. All suppliers, prices, transport and billing
// data are SIMULATED. Demo account passwords come from PACKWISE_DEMO_PASSWORD
// (see .env.example) and exist only for local demonstration.
import crypto from "node:crypto";
import { get, run, all, db } from "./db";
import { hashPassword } from "./auth";
import { recommend, type AssessmentInput } from "../shared/engine/recommend";
import { compact } from "../shared/engine/reassess";
import { offlineJourney } from "../shared/engine/journey";
import { lockHash } from "../shared/engine/validation";

const DEMO_PASSWORD = process.env.PACKWISE_DEMO_PASSWORD ?? "packwise-demo";

export const DEMO_USERS = [
  { email: "producer@demo.packwise", name: "Demo Producer (Panruti)", role: "producer", org: "Panruti Cashew Growers — demo" },
  { email: "transporter@demo.packwise", name: "Demo Transporter", role: "transporter", org: "Demo Goods Carriers" },
  { email: "retailer@demo.packwise", name: "Demo Retailer (Chennai)", role: "retailer", org: "Demo Dry Fruits Store, Chennai" },
  { email: "expert@demo.packwise", name: "Demo Packaging Reviewer", role: "expert", org: "Reviewer panel — demo" },
  { email: "admin@demo.packwise", name: "Demo Admin", role: "admin", org: "PackWise" }
] as const;

export function seedIfEmpty(force = false) {
  const n = get("SELECT COUNT(*) AS n FROM users")?.n ?? 0;
  if (n > 0 && !force) return;
  const ids: Record<string, number> = {};
  for (const u of DEMO_USERS) {
    const { hash, salt } = hashPassword(DEMO_PASSWORD);
    const r = run("INSERT INTO users (email, name, role, org, password_hash, salt) VALUES (?, ?, ?, ?, ?, ?)", u.email, u.name, u.role, u.org, hash, salt);
    ids[u.role] = Number(r.lastInsertRowid);
  }
  const journey = offlineJourney({ name: "Panruti, Cuddalore, Tamil Nadu", lat: 11.776, lon: 79.552, state: "Tamil Nadu" }, { name: "Chennai, Tamil Nadu", lat: 13.083, lon: 80.27, state: "Tamil Nadu" }, "2026-10-05");
  const input: AssessmentInput = {
    commodityId: "cashew-kernel", state: "unroasted", identification: { method: "user-select", confirmed: true },
    portions: [
      { id: "p1", label: "Bulk — immediate use", kg: 50, use: "bulk", storageDays: 2, storage: { type: "ambient-room", status: "assumed" } },
      { id: "p2", label: "Retail — up to 2 weeks", kg: 20, use: "retail", storageDays: 14, storage: { type: "ambient-room", status: "assumed" } },
      { id: "p3", label: "Retail — 5 months", kg: 30, use: "retail", storageDays: 150, storage: { type: "ambient-room", status: "assumed" } }
    ],
    properties: {}, equipment: ["heat-impulse"], journey, userState: "Tamil Nadu"
  };
  const result = compact(recommend(input));
  const plan = result.plans.find((p) => p.tags.includes("delay-tolerant")) ?? result.plans[0];
  const a = run("INSERT INTO assessments (user_id, title, commodity_id, input_json, result_json, engine_version, selected_plan_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ids.producer, "Cashew kernels — Panruti to Chennai (worked example)", input.commodityId, JSON.stringify(input), JSON.stringify(result), result.engineVersion, plan?.id ?? null);
  const assessmentId = Number(a.lastInsertRowid);
  if (!plan) return;
  const sel = plan.selections.find((s) => s.portionId === "p3")!;
  const cand = result.portions.find((p) => p.portion.id === "p3")!.candidates.find((c) => c.key === sel.candidateKey)!;
  const lot = run("INSERT INTO material_lots (user_id, supplier_product_id, lot_code, received_at, units_received, receiving_check_json, accepted) VALUES (?, ?, ?, ?, ?, ?, 1)",
    ids.producer, cand.supplierProductId, "DEMO-LOT-2609", "2026-09-26", cand.units + 20, JSON.stringify({ technicalMatch: true, dimensionsOk: true, lotMatchesOrder: true, sampleSealOk: true, documentsReceived: true, notes: "Seeded demo lot" }));
  const lotId = Number(lot.lastInsertRowid);
  const code = "PW260928-CAS-0001";
  const tokenStr = crypto.randomBytes(8).toString("base64url");
  const b = run(`INSERT INTO batches (public_token, batch_code, producer_id, assessment_id, candidate_key, recommendation_version, commodity_id, commodity_name, state, origin, harvest_date, packed_at, quantity_kg, units, pack_size_kg, structure_id, structure_name, oxygen_control, material_lot_id, supplier_product_id, packing_checks_json, handling_json)
    VALUES (?, ?, ?, ?, ?, ?, 'cashew-kernel', 'Cashew kernels', 'unroasted', 'Panruti, Tamil Nadu', '2026-04-20', '2026-09-28T09:00:00Z', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tokenStr, code, ids.producer, assessmentId, cand.key, `${result.engineVersion} / assessment #${assessmentId}`, cand.units * cand.packSizeKg, cand.units, cand.packSizeKg, cand.structureId, cand.structureName, cand.oxygenControl, lotId, cand.supplierProductId,
    JSON.stringify({ fillWeightChecked: true, sealVisual: true, squeezeTest: true, sampleSize: cand.seal?.sampling.sampleSize ?? 10, failures: 0, absorberAdded: cand.oxygenControl === "absorber" }),
    JSON.stringify({ storage: "Cool, dry, dark place; keep away from strong odours.", disposal: cand.sustainability.recyclability.label, pwmCategory: cand.sustainability.recyclability.pwmCategory, packaging: cand.structureName, oxygenControl: cand.oxygenControl }));
  const batchId = Number(b.lastInsertRowid);
  run("INSERT INTO events (type, batch_id, actor_id, actor_role, event_time, location, units) VALUES ('packed', ?, ?, 'producer', '2026-09-28T09:00:00Z', 'Panruti', ?)", batchId, ids.producer, cand.units);
  const sh = run("INSERT INTO shipments (code, created_by, origin, destination, transporter_id, receiver_id, declared_conditions_json, status) VALUES ('SH-DEMO-01', ?, 'Panruti', 'Chennai', ?, ?, ?, 'received')",
    ids.producer, ids.transporter, ids.retailer, JSON.stringify({ vehicle: "Enclosed goods vehicle (shared load)", notes: "Keep dry; do not stack more than 6 cartons" }));
  const shId = Number(sh.lastInsertRowid);
  run("INSERT INTO shipment_batches (shipment_id, batch_id, units) VALUES (?, ?, ?)", shId, batchId, cand.units);
  run("INSERT INTO events (type, shipment_id, actor_id, actor_role, event_time, location, units) VALUES ('dispatch', ?, ?, 'transporter', '2026-09-29T05:30:00Z', 'Panruti', ?)", shId, ids.transporter, cand.units);
  run("INSERT INTO events (type, shipment_id, actor_id, actor_role, event_time, location) VALUES ('handoff', ?, ?, 'transporter', '2026-09-29T14:00:00Z', 'Transport hub, Chennai')", shId, ids.transporter);
  run("INSERT INTO events (type, shipment_id, actor_id, actor_role, event_time, location, units, condition_json) VALUES ('receipt', ?, ?, 'retailer', '2026-09-30T04:30:00Z', 'Demo Dry Fruits Store, Chennai', ?, ?)", shId, ids.retailer, cand.units, JSON.stringify({ damagedUnits: 0, remarks: "Cartons dry and intact" }));
  for (let i = 1; i <= 3; i++) {
    run("INSERT INTO retail_sales (retailer_id, batch_id, batch_code, unit_serial, quantity, store, source, sold_at) VALUES (?, ?, ?, ?, 1, 'Demo Dry Fruits Store, Chennai', 'pos-simulator', ?)", ids.retailer, batchId, code, `${code}-U000${i}`, `2026-09-30T0${5 + i}:10:00Z`);
    run("INSERT INTO events (type, batch_id, actor_id, actor_role, event_time, location, units, notes) VALUES ('retail-sale', ?, ?, 'retailer', ?, 'Chennai', 1, ?)", batchId, ids.retailer, `2026-09-30T0${5 + i}:10:00Z`, `Unit ${code}-U000${i}`);
  }
  run("INSERT INTO complaints (batch_id, unit_serial, category, description, photos_json, status) VALUES (?, ?, 'leaking-seal', 'Pouch side seal opened when I pressed it.', '[]', 'new')", batchId, `${code}-U0002`);
  run("INSERT INTO complaints (batch_id, category, description, photos_json, status) VALUES (?, 'leaking-seal', 'Zip area seal had a small gap.', '[]', 'new')", batchId);

  // Pre-registered trial with recorded results (illustrative demo numbers)
  const moistPred = cand.moisture ? [30, 60].map((day) => {
    const tr = cand.moisture!.trace;
    const pt = tr.reduce((best, x) => (Math.abs(x.day - day) < Math.abs(best.day - day) ? x : best), tr[0]);
    return { metric: "moisture", day, predicted: Math.round(pt.moistureWb * 100) / 100 };
  }) : [];
  const design = {
    commodityId: "cashew-kernel", control: "Current LDPE 50 µm pouch, air-packed", treatment: cand.structureName + (cand.oxygenControl !== "none" ? ` + ${cand.oxygenControl}` : ""),
    conditions: "ordinary room, Chennai (logged 27–33 °C, 62–84% RH)", durationDays: 60, checkpointsDays: [0, 30, 60], unitsPerArm: 50, primaryMetric: "saleable",
    metrics: [
      { key: "moisture", label: "Kernel moisture", unit: "% w.b.", type: "continuous", direction: "treatment-lower", minimumDifference: 0.3 },
      { key: "saleable", label: "Saleable packs (no rancid smell, crisp)", unit: "pp", type: "proportion", direction: "treatment-higher", minimumDifference: 5 },
      { key: "pv", label: "Peroxide value", unit: "meq O₂/kg", type: "continuous", direction: "treatment-lower", minimumDifference: 1 }
    ],
    predictions: moistPred, assessmentId, candidateKey: cand.key, expertReviewer: "Demo Packaging Reviewer"
  };
  const obs: any[] = [];
  const r = (seed: number) => { const x = Math.sin(seed * 999) * 10000; return x - Math.floor(x); };
  for (let i = 0; i < 6; i++) {
    obs.push({ arm: "control", metric: "moisture", day: 60, value: +(5.15 + (r(i) - 0.5) * 0.4).toFixed(2), sampleId: `C${i + 1}` });
    obs.push({ arm: "treatment", metric: "moisture", day: 60, value: +((moistPred[1]?.predicted ?? 4.2) + 0.18 + (r(i + 10) - 0.5) * 0.3).toFixed(2), sampleId: `T${i + 1}` });
    obs.push({ arm: "control", metric: "pv", day: 60, value: +(4.1 + (r(i + 20) - 0.5) * 1.2).toFixed(2), sampleId: `C${i + 1}` });
    obs.push({ arm: "treatment", metric: "pv", day: 60, value: +(1.6 + (r(i + 30) - 0.5) * 0.8).toFixed(2), sampleId: `T${i + 1}` });
  }
  for (let i = 0; i < 6; i++) {
    obs.push({ arm: "control", metric: "moisture", day: 30, value: +(4.7 + (r(i + 40) - 0.5) * 0.3).toFixed(2) });
    obs.push({ arm: "treatment", metric: "moisture", day: 30, value: +((moistPred[0]?.predicted ?? 4.1) + 0.1 + (r(i + 50) - 0.5) * 0.3).toFixed(2) });
  }
  obs.push({ arm: "control", metric: "saleable", day: 60, value: 38, n: 50 });
  obs.push({ arm: "treatment", metric: "saleable", day: 60, value: 48, n: 50 });
  run("INSERT INTO trials (user_id, assessment_id, title, design_json, locked_at, lock_hash, observations_json, status) VALUES (?, ?, ?, ?, '2026-07-28T10:00:00Z', ?, ?, 'completed')",
    ids.producer, assessmentId, "Cashew retail pouch — 60-day comparison (demo data)", JSON.stringify(design), lockHash(design), JSON.stringify(obs.map((o) => ({ ...o, recordedAt: "2026-09-27T10:00:00Z" }))));
  console.log(`Seeded demo data (${all("SELECT id FROM users").length} users). Demo password from PACKWISE_DEMO_PASSWORD.`);
}

if (process.argv[1]?.endsWith("seed.ts") && process.argv.includes("--reset")) {
  for (const t of ["reviews", "trials", "complaints", "retail_sales", "events", "shipment_batches", "shipments", "batches", "material_lots", "quote_requests", "assessments", "sessions", "users"]) db.exec(`DELETE FROM ${t}`);
  db.exec("DELETE FROM sqlite_sequence");
  seedIfEmpty(true);
}
