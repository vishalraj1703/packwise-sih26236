// Gap 4 — sealing, equipment compatibility and mechanical performance.
// Produces a specification with acceptance tests. Numerical acceptance limits
// are *proposed defaults* flagged for expert confirmation.
import type { Commodity, SealMethod, Structure } from "../types";
import { MATERIALS } from "../data/materials";

export const EQUIPMENT: Record<SealMethod, { label: string; rangeC?: [number, number]; note: string }> = {
  "heat-impulse": { label: "Hand impulse sealer", rangeC: [100, 200], note: "Low-cost; seal width usually 2–5 mm." },
  "band-sealer": { label: "Continuous band sealer", rangeC: [100, 250], note: "Faster, consistent 8–10 mm seals." },
  "vacuum-chamber": { label: "Vacuum chamber machine", rangeC: [100, 200], note: "Removes headspace air before sealing." },
  "vacuum-gas-flush": { label: "Vacuum + gas-flush machine", rangeC: [100, 200], note: "Replaces air with N₂/CO₂." },
  "tray-sealer": { label: "Tray sealer", rangeC: [120, 200], note: "Lidding film on rigid trays." },
  "can-seamer": { label: "Can seamer", note: "Double-seam for metal cans." },
  "sack-stitch": { label: "Bag-closing (stitching) machine", note: "Closes woven sacks; liner is sealed or tied separately." },
  "screw-cap": { label: "Screw / lug cap (manual)", note: "Torque-controlled closure." },
  "clip-tie": { label: "Clip / twist-tie", note: "Not hermetic — suitable only where a barrier seal is not required." },
  none: { label: "No closure (open crate)", note: "Ventilated packing." }
};

export const HERMETIC: SealMethod[] = ["heat-impulse", "band-sealer", "vacuum-chamber", "vacuum-gas-flush", "tray-sealer", "can-seamer", "screw-cap"];

export interface SealCompatibility {
  compatible: boolean;
  method: SealMethod | null;
  viaService: boolean;
  reasons: string[];
}

/** Can the pack be closed properly with what the user owns (or via a packing service)? */
export function sealCompatibility(s: Structure, owned: SealMethod[], needs: { hermetic: boolean; vacuum: boolean; gasFlush: boolean }, serviceMethods: SealMethod[]): SealCompatibility {
  const reasons: string[] = [];
  const required = (m: SealMethod) => {
    if (needs.vacuum && !(m === "vacuum-chamber" || m === "vacuum-gas-flush" || m === "can-seamer")) return false;
    if (needs.gasFlush && !(m === "vacuum-gas-flush" || m === "can-seamer")) return false;
    if (needs.hermetic && !HERMETIC.includes(m) && m !== "sack-stitch") return false;
    return true;
  };
  const sealant = s.layers.length ? MATERIALS[s.layers[s.layers.length - 1].materialId].sealant : undefined;
  const tempOk = (m: SealMethod) => {
    const eq = EQUIPMENT[m];
    if (!eq.rangeC || !sealant) return true;
    return sealant.minC >= eq.rangeC[0] - 5 && sealant.minC <= eq.rangeC[1];
  };
  const candidates = s.sealMethods.filter((m) => required(m) && tempOk(m));
  const manual: SealMethod[] = ["screw-cap", "clip-tie", "none"]; // need no machine
  const ownedMatch = candidates.find((m) => owned.includes(m) || manual.includes(m));
  if (ownedMatch) return { compatible: true, method: ownedMatch, viaService: false, reasons: [`Closes with your ${EQUIPMENT[ownedMatch].label.toLowerCase()}.`] };
  const serviceMatch = candidates.find((m) => serviceMethods.includes(m));
  if (serviceMatch) {
    reasons.push(`You do not own suitable equipment; a packing service with a ${EQUIPMENT[serviceMatch].label.toLowerCase()} is required.`);
    return { compatible: true, method: serviceMatch, viaService: true, reasons };
  }
  if (!candidates.length) reasons.push("No closure method for this structure meets the protection need (e.g. vacuum/gas flush or hermetic seal).");
  else reasons.push(`Needs ${candidates.map((m) => EQUIPMENT[m].label.toLowerCase()).join(" or ")}, which is neither owned nor offered by a matched packing service.`);
  return { compatible: false, method: null, viaService: false, reasons };
}

export interface SealSpec {
  method: SealMethod;
  sealTempC: [number, number] | null;
  sealWidthMm: number;
  seals: Array<{ test: string; standard: string; acceptance: string; sourceId: string }>;
  punctureNote: string | null;
  sampling: { lotSize: number; sampleSize: number; confidence: number; maxDefectRate: number; rule: string };
  proposed: true;
}

/** c = 0 attribute sampling: n = ln(1 − C)/ln(1 − p), capped at lot size. */
export function zeroAcceptanceSample(lotSize: number, confidence = 0.95, maxDefectRate = 0.05) {
  const n = Math.ceil(Math.log(1 - confidence) / Math.log(1 - maxDefectRate));
  return Math.min(n, lotSize);
}

export function sealSpecification(s: Structure, c: Commodity, fillKg: number, method: SealMethod, units: number, mapOrVacuum: boolean, isVacuum = false): SealSpec {
  const sealant = s.layers.length ? MATERIALS[s.layers[s.layers.length - 1].materialId].sealant : undefined;
  const strength = fillKg <= 0.5 ? 10 : fillKg <= 2 ? 15 : 20; // N/15 mm — proposed default
  const width = fillKg <= 1 ? (method === "heat-impulse" ? 5 : 8) : 10;
  const seals: SealSpec["seals"] = [];
  if (method === "can-seamer") {
    seals.push({ test: "Double-seam teardown & measurement", standard: "Can-maker specification", acceptance: "Seam dimensions within can-maker limits; no vacuum loss after 24 h", sourceId: "SEED" });
  } else if (method === "screw-cap") {
    seals.push({ test: "Closure torque and leak check (inverted 1 h)", standard: "Closure supplier specification", acceptance: "Application torque within supplier range; no leakage", sourceId: "SEED" });
  } else if (method !== "none" && method !== "clip-tie" && method !== "sack-stitch") {
    seals.push({ test: "Seal strength (peel)", standard: "ASTM F88", acceptance: `≥ ${strength} N/15 mm, no seal-area delamination`, sourceId: "ASTM-F88" });
    seals.push({ test: "Gross leak (bubble)", standard: "ASTM F2096", acceptance: "No continuous bubble stream from any sample", sourceId: "ASTM-F2096" });
    if (mapOrVacuum || fillKg >= 2) seals.push({ test: "Burst / internal pressurisation", standard: "ASTM F1140", acceptance: "Failure outside the seal area, or above the agreed burst pressure", sourceId: "ASTM-F1140" });
    seals.push({ test: "Visual seal check", standard: "Packing guide", acceptance: "Continuous, uniform, no wrinkles, channels or product in seal", sourceId: "SEED" });
  }
  let punctureNote: string | null = null;
  const puncture = s.layers.reduce((a, l) => a + (MATERIALS[l.materialId].punctureIndex * l.thicknessUm) / 25, 0);
  if (c.mechanical.sharpEdges || isVacuum) {
    punctureNote = puncture < 4
      ? `Low puncture resistance (index ${puncture.toFixed(1)}) for ${c.mechanical.sharpEdges ? "sharp-edged product" : "vacuum packing"} — prefer a structure with a nylon (BOPA) layer.`
      : `Puncture resistance index ${puncture.toFixed(1)} — adequate for vacuum packing (verify with a puncture test on filled packs).`;
  }
  return {
    method,
    sealTempC: sealant ? [sealant.minC, sealant.maxC] : null,
    sealWidthMm: width,
    seals,
    punctureNote,
    sampling: { lotSize: units, sampleSize: zeroAcceptanceSample(units), confidence: 0.95, maxDefectRate: 0.05, rule: "c = 0: accept the lot only if no sample fails" },
    proposed: true
  };
}

// ---------------------------------------------------------------------------
// Secondary (outer) packaging: stacking compression (McKee) and drop heights (ISTA 1A)

export const BOARD_GRADES = [
  { id: "3ply", name: "3-ply corrugated (single wall)", ectNPerM: 4500, caliperMm: 3.5, pricePerM2Inr: 32 },
  { id: "5ply", name: "5-ply corrugated (double wall)", ectNPerM: 7800, caliperMm: 6.5, pricePerM2Inr: 55 },
  { id: "7ply", name: "7-ply corrugated (triple wall)", ectNPerM: 11500, caliperMm: 9.5, pricePerM2Inr: 85 }
];

/** Commonly cited environmental derating factors (reference estimates, MCKEE source). */
export function stackingSafetyFactor(storageDays: number, rhPct: number, aligned: boolean) {
  const time = storageDays <= 10 ? 0.63 : storageDays <= 30 ? 0.6 : storageDays <= 90 ? 0.55 : 0.5;
  const hum = rhPct <= 50 ? 1 : rhPct <= 60 ? 0.9 : rhPct <= 70 ? 0.8 : rhPct <= 80 ? 0.68 : 0.48;
  const pattern = aligned ? 0.9 : 0.55;
  const handling = 0.9;
  const combined = time * hum * pattern * handling;
  return { time, hum, pattern, handling, combined, safetyFactor: 1 / combined };
}

export function mckeeBct(ectNPerM: number, caliperMm: number, perimeterM: number) {
  return 5.874 * ectNPerM * Math.sqrt((caliperMm / 1000) * perimeterM);
}

export function istaDropHeightCm(grossKg: number) {
  if (grossKg < 9.5) return 76;
  if (grossKg < 18.6) return 61;
  if (grossKg < 27.7) return 46;
  if (grossKg < 45.4) return 30;
  return 20;
}

export interface CartonPlan {
  unitsPerCarton: number;
  cartons: number;
  cartonGrossKg: number;
  dimsCm: [number, number, number];
  stackLayers: number;
  requiredBctN: number;
  grade: (typeof BOARD_GRADES)[number] | null;
  bctN: number;
  factors: ReturnType<typeof stackingSafetyFactor>;
  dropHeightCm: number;
  costPerCartonInr: number;
  note: string;
}

/** Choose units per carton (≤ 20 kg gross for manual handling) and board grade meeting McKee BCT with safety factor. */
export function planCartons(unitFillKg: number, unitDims: { w: number; l: number; t: number }, totalUnits: number, stackHeightM: number, storageDays: number, rhPct: number): CartonPlan {
  const maxGross = 20;
  const unitGross = unitFillKg * 1.04;
  const perCarton = Math.max(1, Math.min(totalUnits, Math.floor(maxGross / unitGross)));
  // arrange units flat in layers inside the carton
  const across = Math.max(1, Math.round(Math.sqrt(perCarton / 2)));
  const layers = Math.max(1, Math.ceil(perCarton / (across * 2)));
  const dims: [number, number, number] = [unitDims.w * across + 2, unitDims.l + 2, unitDims.t * layers + 2];
  const cartons = Math.ceil(totalUnits / perCarton);
  const gross = perCarton * unitGross + 0.6;
  const stackLayers = Math.max(1, Math.floor((stackHeightM * 100) / dims[2]));
  const loadN = (stackLayers - 1) * gross * 9.81;
  const factors = stackingSafetyFactor(storageDays, rhPct, true);
  const required = loadN * factors.safetyFactor;
  const perimeter = (2 * (dims[0] + dims[1])) / 100;
  let grade: CartonPlan["grade"] = null;
  let bct = 0;
  for (const g of BOARD_GRADES) {
    bct = mckeeBct(g.ectNPerM, g.caliperMm, perimeter);
    if (bct >= required) { grade = g; break; }
  }
  const areaM2 = (2 * (dims[0] * dims[1] + dims[1] * dims[2] + dims[0] * dims[2])) / 10000;
  const g = grade ?? BOARD_GRADES[BOARD_GRADES.length - 1];
  return {
    unitsPerCarton: perCarton,
    cartons,
    cartonGrossKg: gross,
    dimsCm: dims,
    stackLayers,
    requiredBctN: required,
    grade,
    bctN: grade ? bct : mckeeBct(g.ectNPerM, g.caliperMm, perimeter),
    factors,
    dropHeightCm: istaDropHeightCm(gross),
    costPerCartonInr: areaM2 * g.pricePerM2Inr * 1.15,
    note: grade ? "" : "Even 7-ply board does not meet the stacking requirement — reduce stack height or use pallets/racking."
  };
}

export interface CrateOption { id: string; name: string; capacityKg: number; priceInr: number; reusable: boolean }
export const CRATES: CrateOption[] = [
  { id: "crate-20", name: "Ventilated plastic crate (≈20 kg)", capacityKg: 20, priceInr: 25, reusable: true },
  { id: "cfb-10", name: "Ventilated CFB box (≈10 kg, 5-ply)", capacityKg: 10, priceInr: 38, reusable: false }
];
