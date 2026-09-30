// Recommendation sequence (discussion record p.4):
// check inputs → identify protection needs → exclude incompatible options →
// match documented materials → evaluate supported performance →
// compare feasible costs and trade-offs → explain.
import type { Commodity, Evidenced, ProcessingState, SealMethod, Structure, SupplierProduct } from "../types";
import { getCommodity } from "../data/commodities";
import { MATERIALS, STRUCTURES, plainName } from "../data/materials";
import { examplesFor } from "../data/examples";
import { SUPPLIER_PRODUCTS, SUPPLIERS, ABSORBER_PRICE_INR, getSupplier } from "../data/suppliers";
import { packGeometry, filmMassG, type PackGeometry } from "./geometry";
import { describeLayers, packTransmission, recyclability, structureAtTest, minimumGauge, DP_WVTR_TEST } from "./barrier";
import { moistureTrajectory, requiredWvtr, type ExposureSegment, type MoistureInputs } from "./moisture";
import { RESIDUAL_O2, headspaceO2Mg, oxygenIngressMg, requiredOtr, sizeAbsorber, type OxygenControl } from "./oxygen";
import { designMap, respirationO2, type MapDesign, pct } from "./map";
import { sealCompatibility, sealSpecification, planCartons, CRATES, EQUIPMENT, type SealSpec, type CartonPlan } from "./sealing";
import { transportOptions, transitSegments, storageSegment, type JourneyAnalysis, type StorageSpec, type TransportOption } from "./journey";
import { aggregateOrderCost, standaloneCost, DEFAULT_COST_SETTINGS, type CostItem, type CostSettings } from "./cost";
import { rng, triangular, summarize, wbToDb, sig } from "./physics";

export const ENGINE_VERSION = "packwise-engine 1.0.0 (2026-09-30)";
export const DELAY_SCENARIO = { extraHours: 48, extraC: 4 };
/**
 * Oxidation-duration assumption (open parameter of Gap 1, pending expert review):
 * for total exposure ≤ 30 days, oxidation of available oxygen is treated as slow,
 * so the oxygen budget is reported as a consideration rather than a requirement.
 */
export const OXIDATION_THRESHOLD_DAYS = 30;

export interface Portion {
  id: string;
  label: string;
  kg: number;
  use: "bulk" | "retail";
  storageDays: number;
  storage: StorageSpec;
  packSizeKg?: number | null;
}

export interface PropertyInputs {
  initialMoistureWb?: Evidenced;
  waterActivity?: Evidenced;
  rco2At20?: Evidenced;
  measurements?: Record<string, Evidenced>; // e.g. ph, salt, micro (days of measured shelf life)
}

export interface AssessmentInput {
  commodityId: string;
  state: ProcessingState;
  identification: { method: "photo-ai" | "user-select"; confirmed: boolean; confidence?: number };
  portions: Portion[];
  properties: PropertyInputs;
  equipment: SealMethod[];
  budgetInrPerKg?: number;
  journey: JourneyAnalysis;
  userState?: string;
  costSettings?: Partial<CostSettings>;
}

export interface InputCheck {
  key: string;
  label: string;
  status: Evidenced["status"];
  display: string;
  message: string;
  severity: "ok" | "info" | "warn" | "block";
  sourceId?: string;
}

export interface Need { kind: "moisture" | "oxygen" | "light" | "respiration" | "temperature" | "mechanical" | "insects" | "hygiene"; level: "high" | "medium" | "low"; text: string }

export interface EvidenceItem { label: string; value: string; status: Evidenced["status"] | "calculated" | "documented" | "generic"; sourceId?: string; note?: string }

export type Support = "supported" | "conditional" | "not-supported";

export interface Candidate {
  key: string;
  portionId: string;
  transportId: string;
  structureId: string;
  structureName: string;
  layersText: string;
  format: Structure["format"];
  packSizeKg: number;
  units: number;
  oxygenControl: OxygenControl;
  sealMethod: SealMethod | null;
  viaService: string | null;
  supplierProductId: string | null;
  supplierName: string | null;
  documentation: SupplierProduct["documentation"] | null;
  geometry: PackGeometry;
  support: Support;
  reasons: string[];
  conditions: string[];
  stillToCheck: string[];
  moisture?: { requiredWvtrP50: number; requiredWvtrStrict: number; providedWvtr: number; providedBasis: string; daysP10: number; daysP50: number; targetDays: number; extrapolated: boolean; trace: Array<{ day: number; moistureWb: number }>; criticalWb: number };
  oxygen?: { requiredOtr: number; providedOtr: number; ingressMg: number; headspaceMg: number; budgetMg: number; budgetStrictMg: number; absorberCc: number | null; note: string };
  map?: MapDesign;
  fresh?: { consumedFraction: number; consumedRange: [number, number]; optimumDays: [number, number]; chillingRisk: boolean; note: string };
  seal: SealSpec | null;
  sealNote: string;
  cartons: CartonPlan | null;
  crate: { crates: number; name: string } | null;
  margin: number; // P10 protection days / target days (≥ 1 means meets target conservatively)
  delayMargin: number | null;
  sustainability: { filmGPerPack: number; filmGPerKgFood: number; recyclability: ReturnType<typeof recyclability>; co2eKgPerKgFood: [number, number]; score: number };
  cost: CostItem;
  standaloneInr: number;
  evidence: EvidenceItem[];
  explanation: string;
}

export interface PortionResult {
  portion: Portion;
  targetDays: Record<string, number>;
  checks: InputCheck[];
  needs: Need[];
  requirements: Array<{ label: string; value: string; basis: string }>;
  gaugeHints: Array<{ material: string; gaugeUm: number | null; exactUm: number }>;
  excluded: Array<{ structure: string; reason: string }>;
  candidates: Candidate[];
  insufficient: null | { reason: string; measurements: Array<{ label: string; why: string; howToMeasure: string }> };
  profiles: Record<string, ExposureSegment[]>;
}

export interface OrderPlan {
  id: string;
  tags: Array<"lowest-cost" | "faster" | "delay-tolerant" | "sustainable">;
  transport: TransportOption;
  selections: Array<{ portionId: string; candidateKey: string }>;
  cost: ReturnType<typeof aggregateOrderCost>;
  deliveryHours: number;
  minMargin: number;
  minDelayMargin: number | null;
  sustainabilityScore: number;
  overBudget: boolean;
  headline: string;
  whatItCommunicates: string;
}

export interface Recommendation {
  engineVersion: string;
  createdAt: string;
  commodity: { id: string; name: string; foodClass: Commodity["foodClass"]; review: Commodity["review"] };
  input: AssessmentInput;
  transportOptions: TransportOption[];
  portions: PortionResult[];
  plans: OrderPlan[];
  orderComparison: Array<{ label: string; totalInr: number; perKgInr: number; note: string }>;
  warnings: string[];
  promise: string;
}

// -----------------------------------------------------------------------------

const lo = (e: Evidenced) => e.lo ?? e.value;
const hi = (e: Evidenced) => e.hi ?? e.value;
const fmtEv = (e: Evidenced) => `${e.value}${e.lo !== undefined && e.hi !== undefined && (e.lo !== e.value || e.hi !== e.value) ? ` (${e.lo}–${e.hi})` : ""} ${e.unit}`;

function serviceMethods(userState?: string) {
  return SUPPLIERS.filter((s) => s.packingService && (s.deliversTo.includes("all-india") || !userState || s.deliversTo.includes(userState)));
}

function productsFor(structureId: string, size: number, userState?: string) {
  return SUPPLIER_PRODUCTS.filter((p) => {
    if (p.structureId !== structureId || !p.sizesKg.includes(size)) return false;
    const s = getSupplier(p.supplierId);
    return s.deliversTo.includes("all-india") || !userState || s.deliversTo.includes(userState);
  });
}

function candidateSizes(s: Structure, portion: Portion, c: Commodity): number[] {
  if (c.foodClass === "fresh" && (s.format === "crate")) return s.sizesKg.filter((x) => x <= Math.max(portion.kg, s.sizesKg[0]));
  if (portion.packSizeKg) return s.sizesKg.includes(portion.packSizeKg) ? [portion.packSizeKg] : [];
  if (portion.use === "retail") return s.sizesKg.filter((x) => x >= 0.25 && x <= 1 && x <= portion.kg);
  const bulk = s.sizesKg.filter((x) => x >= 5 && x <= portion.kg);
  return bulk.length ? [Math.max(...bulk.filter((x) => x <= 25)), ...bulk.filter((x) => x > 25)].filter((v, i, a) => Number.isFinite(v) && a.indexOf(v) === i) : [];
}

function oxygenControls(c: Commodity, s: Structure, targetDays: number): OxygenControl[] {
  if (!c.oxygen) return ["none"];
  const out: OxygenControl[] = [];
  if (s.id === "tin-can") return ["gas-flush", "vacuum"];
  out.push("none");
  if (s.sealMethods.includes("vacuum-gas-flush")) out.push("gas-flush");
  if ((s.sealMethods.includes("vacuum-chamber") || s.format === "vacuum-pack") && !(c.mechanical.crushable && c.mechanical.fragility === "high")) out.push("vacuum");
  if (targetDays > 30 && !s.rigid && s.sealMethods.some((m) => m === "heat-impulse" || m === "band-sealer")) out.push("absorber");
  return out;
}

function labourMinutes(s: Structure, control: OxygenControl, units: number, fillKg: number) {
  let perPack = s.rigid ? (s.id === "tin-can" ? 2.5 : s.id === "open-crate" ? 2 : 0.8) : s.kind === "bulk-liner" ? 3 : 0.5;
  if (control === "vacuum" || control === "gas-flush") perPack += 0.6;
  if (control === "absorber") perPack += 0.2;
  perPack += fillKg * 0.05; // weighing/filling
  return perPack * units;
}

/** Relative rate of deterioration for fresh produce: shelf-life fraction consumed along the profile. */
function freshLifeConsumed(c: Commodity, profile: ExposureSegment[]) {
  const r = c.respiration!;
  const tOpt = (r.storageTempC[0] + r.storageTempC[1]) / 2;
  const pr = { rco2At20: r.rco2At20.value, q10: r.q10.value, rq: r.rq.value, km: r.kmO2.value };
  const rOpt = respirationO2(0.209, tOpt, pr);
  const dOpt = (r.maxStorageDaysAtOptimum[0] + r.maxStorageDaysAtOptimum[1]) / 2;
  let rel = 0;
  let chilling = false;
  for (const s of profile) {
    rel += s.days * (respirationO2(0.209, s.tC, pr) / rOpt); // equivalent days at the optimum temperature
    if (r.chillingInjuryBelowC !== undefined && s.tC < r.chillingInjuryBelowC) chilling = true;
  }
  return {
    consumed: rel / dOpt,
    consumedOptimistic: rel / r.maxStorageDaysAtOptimum[1],
    consumedConservative: rel / r.maxStorageDaysAtOptimum[0],
    chilling, dOpt, tOpt
  };
}

// -----------------------------------------------------------------------------

export function recommend(input: AssessmentInput): Recommendation {
  const c = getCommodity(input.commodityId);
  const settings = { ...DEFAULT_COST_SETTINGS, ...(input.costSettings ?? {}) };
  const totalKg = input.portions.reduce((a, p) => a + p.kg, 0);
  const reeferSet = c.respiration ? (c.respiration.storageTempC[0] + c.respiration.storageTempC[1]) / 2 : c.foodClass === "chilled-perishable" ? 4 : undefined;
  const tOpts = transportOptions(input.journey, totalKg, reeferSet);
  const warnings: string[] = [...input.journey.warnings];
  if (!input.identification.confirmed) warnings.push("Food identity has not been confirmed by the user — confirm before relying on the result.");
  if (c.review === "unreviewed-seed") warnings.push(`Commodity data for ${c.name} are unreviewed seed/reference values. Expert review is pending; treat results as screening, not as a specification.`);

  const portions = input.portions.map((p) => evaluatePortion(c, p, input, tOpts));
  const plans = buildPlans(portions, tOpts, input, settings);
  const orderComparison = compareCommonPouch(portions, tOpts, input, settings, plans);
  return {
    engineVersion: ENGINE_VERSION,
    createdAt: new Date().toISOString(),
    commodity: { id: c.id, name: c.name, foodClass: c.foodClass, review: c.review },
    input,
    transportOptions: tOpts,
    portions,
    plans,
    orderComparison,
    warnings,
    promise: "For each recommendation we show why it fits, what evidence supports it, what conditions it requires and what still needs checking."
  };
}

function evaluatePortion(c: Commodity, portion: Portion, input: AssessmentInput, tOpts: TransportOption[]): PortionResult {
  const checks: InputCheck[] = [];
  const needs: Need[] = [];
  const requirements: PortionResult["requirements"] = [];
  const excluded: PortionResult["excluded"] = [];
  const candidates: Candidate[] = [];
  const profiles: Record<string, ExposureSegment[]> = {};
  const targetDays: Record<string, number> = {};
  const relevantTransports = tOpts.filter((t) => t.mode !== "reefer" || c.foodClass !== "dry");
  for (const t of relevantTransports) {
    profiles[t.id] = [...transitSegments(input.journey, t), storageSegment(input.journey, portion.storage, Math.max(portion.storageDays, 0.01))];
    targetDays[t.id] = profiles[t.id].reduce((a, s) => a + s.days, 0);
  }

  // 1. Check inputs ---------------------------------------------------------
  checks.push({
    key: "identity", label: "Food identity", status: input.identification.confirmed ? "reported" : "unknown",
    display: `${c.name} (${input.state})`,
    message: input.identification.method === "photo-ai" ? "Suggested from photo and confirmed by user. A photo cannot establish moisture, pH, fat or microbial state." : "Selected by user.",
    severity: input.identification.confirmed ? "ok" : "block"
  });
  const storageStatus = portion.storage.status === "measured" ? "measured" : portion.storage.tC !== undefined ? "reported" : "assumed";
  checks.push({
    key: "storage", label: "Storage conditions", status: storageStatus,
    display: `${portion.storage.type}${portion.storage.tC !== undefined ? `, ${portion.storage.tC} °C` : ""}${portion.storage.rhPct !== undefined ? `, ${portion.storage.rhPct}% RH` : ""}`,
    message: storageStatus === "assumed" ? "Room temperature/humidity assumed from destination climate. A ₹300 thermo-hygrometer reading would replace this assumption." : "Provided by user.",
    severity: storageStatus === "assumed" ? "info" : "ok"
  });

  c.notes.forEach((n, i) => checks.push({ key: `note-${i}`, label: "Note", status: "reference", display: "", message: n, severity: "info" }));
  let insufficient: PortionResult["insufficient"] = null;
  let moistInputs: { mi: Evidenced; mc: Evidenced; a: Evidenced; b: Evidenced } | null = null;

  if (c.moisture) {
    const mi = input.properties.initialMoistureWb ?? c.moisture.initialWb;
    moistInputs = { mi, mc: c.moisture.criticalWb, a: c.moisture.isoA, b: c.moisture.isoB };
    checks.push({
      key: "moisture", label: "Initial moisture", status: mi.status, display: fmtEv(mi), sourceId: mi.sourceId,
      message: mi.status === "measured" || mi.status === "reported" ? "Batch value provided." : "Reference estimate, not a batch measurement. Measuring the batch (oven-drying or a moisture meter) narrows the uncertainty.",
      severity: mi.status === "measured" || mi.status === "reported" ? "ok" : "warn"
    });
    if (mi.value >= c.moisture.criticalWb.value) {
      checks.push({ key: "moisture-limit", label: "Moisture already at limit", status: mi.status, display: fmtEv(mi), message: `The food is already at or above the ${c.moisture.criticalWb.value}% limit. Packaging cannot correct this — dry the product first.`, severity: "block" });
      insufficient = { reason: "Initial moisture is at or above the critical limit; no packaging can make this batch compliant.", measurements: [{ label: "Re-dry and re-measure moisture", why: "The product must be below its limit before packing.", howToMeasure: "Oven-drying method or calibrated moisture meter." }] };
    }
    checks.push({ key: "isotherm", label: "Sorption isotherm", status: c.moisture.isoB.status, display: `M = ${c.moisture.isoA.value} + ${c.moisture.isoB.value}·aw (aw ${c.moisture.isoRange[0]}–${c.moisture.isoRange[1]})`, sourceId: c.moisture.isoB.sourceId, message: "Linearised isotherm — illustrative until replaced by a sourced or measured isotherm.", severity: c.moisture.isoB.sourceId === "SEED" ? "warn" : "info" });
    needs.push({ kind: "moisture", level: "high", text: `Keep moisture below ${c.moisture.criticalWb.value}% (w.b.). ${c.moisture.criticalReason}` });
  }
  if (c.oxygen) {
    checks.push({ key: "oxygen", label: "Oxygen tolerance", status: c.oxygen.tolerancePpm.status, display: fmtEv(c.oxygen.tolerancePpm), sourceId: c.oxygen.tolerancePpm.sourceId, message: "Class-level tolerance (textbook table). A product-specific limit needs a storage study (peroxide value / sensory).", severity: "info" });
    needs.push({ kind: "oxygen", level: portion.storageDays > 30 ? "high" : "medium", text: c.oxygen.reason });
  }
  if (c.lightSensitive) needs.push({ kind: "light", level: "medium", text: "Light accelerates colour loss / oxidation — opaque pack or dark outer carton." });
  if (c.insectRisk) needs.push({ kind: "insects", level: "medium", text: "Hermetic closure prevents insect entry; avoid tie-closures for storage." });
  if (c.mechanical.fragility !== "low") needs.push({ kind: "mechanical", level: c.mechanical.fragility === "high" ? "high" : "medium", text: c.mechanical.crushable ? "Crushable — limit stacking load and cushion." : "Handle to avoid breakage." });

  if (c.respiration) {
    const r = c.respiration;
    const rc = input.properties.rco2At20 ?? r.rco2At20;
    checks.push({ key: "respiration", label: "Respiration rate at 20 °C", status: rc.status, display: fmtEv(rc), sourceId: rc.sourceId, message: rc.status === "measured" ? "Measured." : "Reference range — actual rate depends on cultivar and maturity. A closed-jar respiration test narrows the perforation range.", severity: rc.status === "measured" ? "ok" : "warn" });
    needs.push({ kind: "respiration", level: "high", text: `Keep O₂ ${pct(r.targetO2[0])}–${pct(r.targetO2[1])} and CO₂ ${pct(r.targetCo2[0])}–${pct(r.targetCo2[1])} (${r.sourceIdGas}); avoid O₂ < ${pct(r.minO2)} (fermentation) and CO₂ > ${pct(r.maxCo2)} (injury).` });
    needs.push({ kind: "temperature", level: "high", text: `Best at ${r.storageTempC[0]}–${r.storageTempC[1]} °C${r.chillingInjuryBelowC !== undefined ? `; chilling injury below ${r.chillingInjuryBelowC} °C` : ""}.` });
    if (rc !== r.rco2At20) c = { ...c, respiration: { ...r, rco2At20: rc } };
  }
  if (c.requiredMeasurements) {
    const missing = c.requiredMeasurements.filter((m) => !input.properties.measurements?.[m.key]);
    for (const m of c.requiredMeasurements) {
      const v = input.properties.measurements?.[m.key];
      checks.push({ key: m.key, label: m.label, status: v ? v.status : "unknown", display: v ? fmtEv(v) : "not provided", message: v ? "Provided." : m.why, severity: v ? "ok" : "block" });
    }
    if (missing.length) {
      insufficient = {
        reason: `Evidence is insufficient to recommend packaging for ${c.name}: ${missing.map((m) => m.label.toLowerCase()).join(", ")} ${missing.length > 1 ? "are" : "is"} decision-critical and cannot be estimated from a photo or a reference table.`,
        measurements: missing.map((m) => ({ label: m.label, why: m.why, howToMeasure: m.howToMeasure }))
      };
    }
    needs.push({ kind: "hygiene", level: "high", text: "Food-contact materials suitable for fatty/acidic/moist food; clean filling to avoid contamination." });
  }
  if (c.foodClass === "chilled-perishable") needs.push({ kind: "temperature", level: "high", text: "Continuous cold chain ≤ 4 °C (refrigerated transport and storage)." });

  if (insufficient) {
    return { portion, targetDays, checks, needs, requirements, gaugeHints: [], excluded, candidates, insufficient, profiles };
  }

  // 2. Requirements at standard test conditions ----------------------------
  const refTransport = relevantTransports.find((t) => t.id === "dedicated") ?? relevantTransports[0];
  const gaugeHints: PortionResult["gaugeHints"] = [];
  const reqCache = new Map<string, { p50: number; strict: number }>();
  const wvtrReq = (size: number, tId: string, geomArea: number) => {
    const key = `${size}|${tId}`;
    if (reqCache.has(key)) return reqCache.get(key)!;
    const m = moistInputs!;
    const rand = rng(99);
    const vals: number[] = [];
    for (let i = 0; i < 40; i++) {
      const inp: MoistureInputs = {
        initialWb: triangular(rand(), lo(m.mi), m.mi.value, hi(m.mi)),
        criticalWb: triangular(rand(), lo(m.mc), m.mc.value, hi(m.mc)),
        isoA: triangular(rand(), lo(m.a), m.a.value, hi(m.a)),
        isoB: triangular(rand(), lo(m.b), m.b.value, hi(m.b)),
        isoRange: c.moisture!.isoRange, fillKg: size, areaM2: geomArea, direction: c.moisture!.direction
      };
      const r = requiredWvtr(inp, profiles[tId]);
      vals.push(r.alwaysOk ? 1e6 : r.wvtrTest);
    }
    const s = summarize(vals);
    const out = { p50: s.p50, strict: s.p10 };
    reqCache.set(key, out);
    return out;
  };

  // 3. Candidate structures --------------------------------------------------
  const svc = serviceMethods(input.userState);
  const svcMethods = [...new Set(svc.flatMap((s) => s.packingService!.methods))];
  for (const s of STRUCTURES) {
    if (!s.suitableFor.includes(c.foodClass)) { excluded.push({ structure: s.name, reason: `Not a format for ${c.foodClass} foods.` }); continue; }
    if (portion.use === "retail" && s.kind === "bulk-liner" && c.foodClass !== "fresh") { excluded.push({ structure: s.name, reason: "Bulk format — not used for retail packs." }); continue; }
    if (portion.use === "bulk" && s.kind === "primary" && !s.sizesKg.some((x) => x >= 5)) { excluded.push({ structure: s.name, reason: "Not available in bulk sizes." }); continue; }
    if (c.foodClass === "fresh" && s.kind !== "rigid" && !s.microperforatable) { excluded.push({ structure: s.name, reason: "Fresh produce needs gas exchange — film must be micro-perforatable." }); continue; }
    if (c.mechanical.crushable && c.mechanical.fragility === "high" && s.format === "vacuum-pack") { excluded.push({ structure: s.name, reason: "Vacuum packing would crush this fragile food." }); continue; }
    const sizes = candidateSizes(s, portion, c);
    if (!sizes.length) { excluded.push({ structure: s.name, reason: portion.packSizeKg ? `Not available in ${portion.packSizeKg} kg size.` : "No suitable size for this portion." }); continue; }

    for (const t of relevantTransports) {
      if (c.foodClass === "chilled-perishable" && t.mode !== "reefer") continue;
      const profile = profiles[t.id];
      const target = targetDays[t.id];
      for (const size of sizes) {
        const controls = oxygenControls(c, s, target);
        for (const control of controls) {
          const cand = evaluateCandidate(c, s, portion, input, t, profile, target, size, control, svcMethods, svc.map((x) => x.id), wvtrReq);
          if (cand) candidates.push(cand);
        }
      }
    }
  }
  // Requirements summary (reference transport, typical size)
  const refSize = portion.packSizeKg ?? (portion.use === "retail" ? 0.5 : Math.min(portion.kg, 25));
  const refGeom = packGeometry(STRUCTURES[0], refSize, c.bulkDensityKgPerL, 1.05, false);
  if (c.moisture && refTransport) {
    const r = wvtrReq(refSize, refTransport.id, refGeom.permeableAreaM2);
    requirements.push({ label: `Required WVTR (${refSize} kg pack, ${Math.round(targetDays[refTransport.id])} days)`, value: r.p50 >= 1e5 ? "no moisture barrier needed" : `≤ ${sig(r.p50)} g/m²·day (conservative ${sig(r.strict)})`, basis: "38 °C / 90% RH test condition; derived from the Labuza moisture-gain model over the full exposure profile (P50 and P10 of input uncertainty)." });
    if (r.strict < 1e5) {
      for (const mid of ["LDPE", "HDPE", "BOPP", "CPP"]) {
        const g = minimumGauge(mid, undefined, r.strict);
        if (g) gaugeHints.push({ material: MATERIALS[mid].commonName, gaugeUm: g.gaugeUm, exactUm: g.exactUm });
      }
    }
  }
  if (c.oxygen && refTransport) {
    const otr = requiredOtr(c.oxygen.tolerancePpm.value, refSize, refGeom.permeableAreaM2, profiles[refTransport.id]);
    const otrStrict = requiredOtr(lo(c.oxygen.tolerancePpm), refSize, refGeom.permeableAreaM2, profiles[refTransport.id]);
    const shortTerm = targetDays[refTransport.id] <= OXIDATION_THRESHOLD_DAYS;
    requirements.push({ label: `Required OTR (${refSize} kg pack, ${Math.round(targetDays[refTransport.id])} days)`, value: shortTerm ? `not decision-critical for ≤ ${OXIDATION_THRESHOLD_DAYS} days (would be ≤ ${sig(otr)} for full budget)` : `≤ ${sig(otr)} cc/m²·day·atm (conservative ${sig(otrStrict)})`, basis: "23 °C / 0% RH test condition; oxygen-budget method (tolerable O₂ gain ÷ exposure-weighted ingress per unit OTR)." });
    if (!shortTerm) for (const mid of ["BOPA", "EVOH", "PET"]) {
      const g = minimumGauge(mid, otrStrict);
      if (g) gaugeHints.push({ material: `${MATERIALS[mid].commonName} (for OTR)`, gaugeUm: g.gaugeUm, exactUm: g.exactUm });
    }
  }
  if (c.respiration) {
    requirements.push({ label: "Target in-pack atmosphere", value: `O₂ ${pct(c.respiration.targetO2[0])}–${pct(c.respiration.targetO2[1])}, CO₂ ${pct(c.respiration.targetCo2[0])}–${pct(c.respiration.targetCo2[1])}`, basis: `${c.respiration.sourceIdGas} recommended atmosphere; film + perforation conductance sized to respiration at storage temperature.` });
  }
  return { portion, targetDays, checks, needs, requirements, gaugeHints, excluded, candidates, insufficient: null, profiles };
}

function evaluateCandidate(
  c: Commodity, s: Structure, portion: Portion, input: AssessmentInput, t: TransportOption, profile: ExposureSegment[], target: number,
  size: number, control: OxygenControl, svcMethods: SealMethod[], svcIds: string[],
  wvtrReq: (size: number, tId: string, area: number) => { p50: number; strict: number }
): Candidate | null {
  const units = Math.ceil(portion.kg / size - 1e-9);
  const vacuum = control === "vacuum";
  const geom = packGeometry(s, size, c.bulkDensityKgPerL, 1.05, vacuum);
  const reasons: string[] = [], conditions: string[] = [], stillToCheck: string[] = [], evidence: EvidenceItem[] = [];
  let support = "supported" as Support;
  const downgrade = (to: Support) => { if (to === "not-supported" || (to === "conditional" && support === "supported")) support = to; };

  // Supplier match (documented performance)
  const products = productsFor(s.id, size, input.userState);
  const product = products.sort((a, b) => a.unitPriceInr[String(size)] - b.unitPriceInr[String(size)])[0] ?? null;
  const generic = structureAtTest(s);
  let scaleO2 = 1, scaleH2O = 1, providedBasis = "generic literature values";
  if (product && product.documentation !== "none" && product.declared.otr && product.declared.wvtr && !s.rigid) {
    scaleO2 = product.declared.otr / generic.otr;
    scaleH2O = product.declared.wvtr / generic.wvtr;
    providedBasis = product.documentation === "third-party-test-report" ? `supplier third-party test report (${product.declared.reportDate})` : "supplier-declared datasheet";
  }
  if (!product) { reasons.push("No matched supplier delivers this structure and size to your location."); downgrade("not-supported"); }
  else if (product.documentation === "none" && s.id !== "open-crate") { stillToCheck.push("Supplier has no barrier documentation — request an OTR/WVTR test report before relying on this option."); downgrade("conditional"); }
  const tx = (tC: number, rh: number) => {
    const v = packTransmission(s, geom.permeableAreaM2, size, tC, rh);
    return { o2: v.o2CcPerDayAtm * scaleO2, h2o: v.h2oGPerDayPa * scaleH2O, co2: v.co2CcPerDayAtm * scaleO2 };
  };

  // Seal / equipment compatibility
  const needsHermetic = c.foodClass === "dry" || c.foodClass === "wet-processed" || c.foodClass === "chilled-perishable" || (c.foodClass === "fresh" && s.kind === "primary");
  const compat = sealCompatibility(s, input.equipment, { hermetic: needsHermetic, vacuum, gasFlush: control === "gas-flush" }, svcMethods);
  let viaService: string | null = null;
  if (!compat.compatible) { reasons.push(...compat.reasons); downgrade("not-supported"); }
  else if (compat.viaService) {
    viaService = SUPPLIERS.find((x) => svcIds.includes(x.id) && x.packingService!.methods.includes(compat.method!))?.id ?? null;
    conditions.push(compat.reasons[0]);
  }

  // --- Moisture
  let moisture: Candidate["moisture"];
  let marginM = Infinity;
  if (c.moisture) {
    const m = c.moisture;
    const mi = input.properties.initialMoistureWb ?? m.initialWb;
    const rand = rng(7 + Math.round(size * 100));
    const docVar = product?.documentation === "third-party-test-report" ? 0.1 : product?.documentation === "supplier-declared" ? 0.15 : 0.25;
    const days: number[] = [];
    let extrapolated = false;
    for (let i = 0; i < 120; i++) {
      const fVar = triangular(rand(), 1 - docVar, 1, 1 + docVar);
      const inp: MoistureInputs = {
        initialWb: triangular(rand(), lo(mi), mi.value, hi(mi)), criticalWb: triangular(rand(), lo(m.criticalWb), m.criticalWb.value, hi(m.criticalWb)),
        isoA: triangular(rand(), lo(m.isoA), m.isoA.value, hi(m.isoA)), isoB: triangular(rand(), lo(m.isoB), m.isoB.value, hi(m.isoB)),
        isoRange: m.isoRange, fillKg: size, areaM2: geom.permeableAreaM2, direction: m.direction
      };
      const r = moistureTrajectory(inp, profile, (tC, rh) => tx(tC, rh).h2o * fVar, 1);
      days.push(r.criticalDayExtended ?? Infinity);
      extrapolated ||= r.extrapolated;
    }
    const sm = summarize(days.map((d) => (Number.isFinite(d) ? d : 1e6)));
    const central = moistureTrajectory({ initialWb: mi.value, criticalWb: m.criticalWb.value, direction: m.direction, isoA: m.isoA.value, isoB: m.isoB.value, isoRange: m.isoRange, fillKg: size, areaM2: geom.permeableAreaM2 }, profile, (tC, rh) => tx(tC, rh).h2o, 6);
    const req = wvtrReq(size, t.id, geom.permeableAreaM2);
    const provided = s.rigid ? NaN : generic.wvtr * scaleH2O;
    moisture = { requiredWvtrP50: req.p50, requiredWvtrStrict: req.strict, providedWvtr: provided, providedBasis, daysP10: sm.p10, daysP50: sm.p50, targetDays: target, extrapolated, trace: central.trace, criticalWb: m.criticalWb.value };
    marginM = sm.p10 / target;
    if (sm.p50 < target) { reasons.push(`Moisture reaches ${m.criticalWb.value}% after ≈${Math.round(sm.p50)} days (median) — target is ${Math.round(target)} days.`); downgrade("not-supported"); }
    else if (sm.p10 < target) { stillToCheck.push(`Moisture protection is marginal: conservative estimate ${Math.round(sm.p10)} days vs target ${Math.round(target)} days. Measuring the batch moisture would firm this up.`); downgrade("conditional"); }
    if (extrapolated) stillToCheck.push("Humidity along the journey lies outside the isotherm's applicable range — estimate is an extrapolation.");
    evidence.push({ label: "Moisture protection (P10 / P50 days to limit)", value: `${fmtDays(sm.p10)} / ${fmtDays(sm.p50)} vs target ${Math.round(target)} d`, status: "calculated", sourceId: "LABUZA" });
    if (!s.rigid) evidence.push({ label: "Pack WVTR (38 °C / 90% RH)", value: `${sig(provided)} g/m²·day — required ≤ ${req.p50 >= 1e5 ? "any" : sig(req.p50)}`, status: product && product.documentation !== "none" ? "documented" : "generic", sourceId: product && product.documentation !== "none" ? "SIM" : "POLYMER-HANDBOOK", note: providedBasis });
  }

  // --- Oxygen
  let oxygen: Candidate["oxygen"];
  let marginO = Infinity;
  if (c.oxygen) {
    const tol = c.oxygen.tolerancePpm;
    const budget = tol.value * size, budgetStrict = lo(tol) * size;
    const ingress = oxygenIngressMg(profile, (tC, rh) => tx(tC, rh).o2);
    const hs = headspaceO2Mg(geom.headspaceL, RESIDUAL_O2[control]);
    let absorberCc: number | null = null;
    let effectiveIngress = ingress, effectiveHs = hs;
    let note = "";
    if (control === "absorber") {
      const a = sizeAbsorber(geom.headspaceL, ingress);
      absorberCc = a.sachetCc;
      if (!a.sachetCc) { reasons.push("Oxygen ingress too large for a practical absorber sachet."); downgrade("not-supported"); }
      else { effectiveIngress = 0; effectiveHs = 0; note = `One ${a.sachetCc} cc absorber sachet absorbs headspace O₂ and ingress (need ≈${Math.round(a.neededCc)} cc incl. 30% margin).`; }
    }
    const reqOtr = requiredOtr(tol.value, size, geom.permeableAreaM2, profile);
    const providedOtr = s.rigid ? NaN : generic.otr * scaleO2;
    oxygen = { requiredOtr: reqOtr, providedOtr, ingressMg: ingress, headspaceMg: hs, budgetMg: budget, budgetStrictMg: budgetStrict, absorberCc, note };
    const longTerm = target > OXIDATION_THRESHOLD_DAYS;
    const available = effectiveIngress + effectiveHs;
    if (longTerm) {
      marginO = available > 0 ? budgetStrict / available : Infinity;
      if (effectiveHs > budget) { reasons.push(`Air left in the pack holds ≈${sig(hs)} mg O₂ — more than the ${sig(budget)} mg tolerance for storage beyond ${OXIDATION_THRESHOLD_DAYS} days. Use gas flushing, vacuum or an absorber.`); downgrade("not-supported"); }
      else if (effectiveIngress > budget - effectiveHs) { reasons.push(`Oxygen entering over ${Math.round(target)} days (≈${sig(ingress)} mg) plus residual headspace exceeds the tolerable ${sig(budget)} mg for a ${size} kg pack.`); downgrade("not-supported"); }
      else if (available > budgetStrict) { stillToCheck.push("Oxygen exposure is within the typical tolerance but above the strict end of the range."); downgrade("conditional"); }
    } else if (available > budget) {
      conditions.push(`About ${sig(available)} mg O₂ is available to the food (headspace + ingress) vs a long-storage tolerance of ${sig(budget)} mg. For ${Math.round(target)} days this is treated as acceptable because oxidation is slow over short periods — an assumption (≤ ${OXIDATION_THRESHOLD_DAYS} days) to confirm by sensory check.`);
    }
    evidence.push({ label: "Oxygen available (ingress + headspace) vs tolerance", value: `${sig(effectiveIngress)} + ${sig(effectiveHs)} mg vs ${sig(budget)} mg${longTerm ? "" : " (not decision-critical ≤ 30 d)"}`, status: "calculated", sourceId: "SALAME" });
    if (!s.rigid) evidence.push({ label: "Pack OTR (23 °C / 0% RH)", value: `${sig(providedOtr)} cc/m²·day·atm — required ≤ ${sig(reqOtr)}`, status: product && product.documentation !== "none" ? "documented" : "generic", sourceId: product && product.documentation !== "none" ? "SIM" : "POLYMER-HANDBOOK", note: providedBasis });
    if (control === "gas-flush") { conditions.push("Nitrogen flush to ≤ 2% residual O₂ — verify with a headspace oxygen analyser on sample packs."); evidence.push({ label: "Residual O₂ after flushing", value: "≤ 2% (assumed)", status: "assumed", note: "Measure with a headspace analyser" }); }
    if (control === "vacuum") conditions.push("Vacuum pack — check for leaks (loss of vacuum within 24 h means seal failure).");
  }

  // --- Light
  if (c.lightSensitive && s.transparency !== "opaque") conditions.push("Clear pack: keep in a closed outer carton and store away from light.");

  // --- Fresh produce: MAP + temperature
  let map: MapDesign | undefined;
  let fresh: Candidate["fresh"];
  let marginF = Infinity;
  if (c.respiration) {
    const fl = freshLifeConsumed(c, profile);
    const r = c.respiration;
    fresh = { consumedFraction: fl.consumed, consumedRange: [fl.consumedOptimistic, fl.consumedConservative], optimumDays: r.maxStorageDaysAtOptimum, chillingRisk: fl.chilling, note: `Relative-rate estimate: at ${fl.tOpt} °C the reference life is ≈${fl.dOpt} days; warmer segments consume it faster in proportion to respiration (Q10 ${r.q10.value}).` };
    marginF = 1 / Math.max(fl.consumedConservative, 1e-6);
    if (fl.consumedOptimistic > 1) { reasons.push(`The journey and storage temperatures use up ≈${Math.round(fl.consumed * 100)}% of the produce's reference storage life (even the optimistic estimate exceeds 100%) — no packaging can compensate; shorten storage or cool the produce.`); downgrade("not-supported"); }
    else if (fl.consumedConservative > 0.8) { stillToCheck.push(`Uses ≈${Math.round(fl.consumed * 100)}% of the reference storage life (range ${Math.round(fl.consumedOptimistic * 100)}–${Math.round(fl.consumedConservative * 100)}%) — little margin for delays.`); downgrade("conditional"); }
    if (fl.chilling) { reasons.push(`Temperatures below ${r.chillingInjuryBelowC} °C risk chilling injury.`); downgrade("not-supported"); }
    evidence.push({ label: "Storage-life consumed (relative rate)", value: `${Math.round(fl.consumed * 100)}%`, status: "calculated", sourceId: "USDA-HB66", note: "Respiration-rate proportional estimate — not a shelf-life claim." });
    if (s.microperforatable) {
      const storageT = profile[profile.length - 1].tC;
      const filmUm = s.layers.reduce((a, l) => a + l.thicknessUm, 0);
      const beta = s.layers.length ? MATERIALS[s.layers[0].materialId].co2O2Ratio : 4;
      map = designMap(c, size, filmUm, (tC) => tx(tC, 90).o2, beta, geom.headspaceL, profile, storageT);
      if (!map.feasible) { reasons.push(map.reason); downgrade("not-supported"); }
      else {
        conditions.push(`Laser micro-perforation: ${map.holes} holes of ${map.holeDiameterUm} µm per pack (range ${map.holesRange[0]}–${map.holesRange[1]} for the respiration range).`);
        stillToCheck.push("Verify the atmosphere in sample packs with a headspace O₂/CO₂ analyser after equilibrium.");
        if (map.probability.inWindow < 0.8) downgrade("conditional");
      }
      evidence.push({ label: "MAP equilibrium at storage (P10–P90 O₂)", value: `${pct(map.o2Dist.p10)}–${pct(map.o2Dist.p90)}; in window ${Math.round(map.probability.inWindow * 100)}%, anaerobic risk ${Math.round(map.probability.anaerobic * 100)}%`, status: "calculated", sourceId: "FISHMAN" });
    } else {
      conditions.push("Open ventilated crate — no modified atmosphere; relies on temperature and short transit.");
    }
    if (r.ethyleneProducer) conditions.push("Do not ship with ethylene-sensitive produce.");
  }

  // --- Wet / chilled with measurements provided
  if (c.requiredMeasurements) {
    const meas = input.properties.measurements ?? {};
    if (c.id === "mango-pickle") {
      const ph = meas.ph?.value ?? 7;
      if (ph > 4.6) { reasons.push("pH above 4.6: ambient storage safety depends on a validated process — outside this tool's scope; consult a food technologist."); downgrade("not-supported"); }
      else { conditions.push("Acidified product (pH ≤ 4.6 measured). Keep an oil layer on top; use clean, dry filling."); stillToCheck.push("Shelf life must come from a storage study of this recipe — not predicted here."); downgrade("conditional"); }
      if (s.id === "pet-al-pe" || s.id === "pet-pe") stillToCheck.push("Confirm the sealant is declared suitable for oily/acidic foods (migration compliance).");
    }
    if (c.foodClass === "chilled-perishable") {
      const studyDays = meas.micro?.value;
      if (studyDays !== undefined && portion.storageDays + t.transitHours / 24 > studyDays) { reasons.push(`Measured shelf life (${studyDays} days at ≤ 4 °C) is shorter than the requested ${Math.round(target)} days.`); downgrade("not-supported"); }
      conditions.push("Cold chain ≤ 4 °C throughout — refrigerated vehicle and storage.");
      evidence.push({ label: "Shelf life at ≤ 4 °C (user storage study)", value: studyDays !== undefined ? `${studyDays} days` : "not provided", status: meas.micro?.status ?? "unknown" });
    }
  }

  // --- Seal specification & mechanical
  const seal = compat.method ? sealSpecification(s, c, size, compat.method, units, vacuum || control === "gas-flush" || !!map, vacuum) : null;
  if (!s.rigid && seal?.punctureNote && seal.punctureNote.startsWith("Low")) { stillToCheck.push(seal.punctureNote); downgrade("conditional"); }
  let cartons: CartonPlan | null = null;
  let crate: Candidate["crate"] = null;
  let outerInr = 0, outerDetail = "";
  const storageRh = profile[profile.length - 1].rhPct;
  if (c.foodClass === "fresh") {
    const cr = CRATES[0];
    const n = s.kind === "rigid" || s.kind === "bulk-liner" ? Math.ceil(portion.kg / cr.capacityKg) : Math.ceil(portion.kg / (cr.capacityKg * 0.8));
    crate = { crates: n, name: cr.name };
    outerInr = n * cr.priceInr;
    outerDetail = `${n} × ${cr.name} (per-trip rental, simulated)`;
  } else if (!(s.kind === "bulk-liner" && s.id === "woven-ldpe-liner")) {
    const dims = { w: geom.flatWidthCm * 0.85, l: geom.flatLengthCm * 0.85, t: Math.max(3, (geom.packVolumeL * 1000) / (geom.flatWidthCm * 0.85 * geom.flatLengthCm * 0.85)) };
    cartons = planCartons(size, dims, units, 1.5, portion.storageDays + t.transitHours / 24, storageRh);
    outerInr = cartons.cartons * cartons.costPerCartonInr;
    outerDetail = `${cartons.cartons} × ${cartons.grade?.name ?? "carton"}`;
    if (!cartons.grade) { stillToCheck.push(cartons.note); downgrade("conditional"); }
  }

  // --- Sustainability
  const filmG = filmMassG(s, geom, (id) => MATERIALS[id].densityGcc);
  const rec = recyclability(s);
  const co2e: [number, number] = s.rigid
    ? (() => { const f = { metal: [2.5, 3.5], glass: [0.8, 1.2], PET: [2.2, 3.0], PP: [1.6, 2.0] } as Record<string, number[]>; const r = f[s.rigid!.family] ?? [2, 3]; return [(filmG / 1000) * r[0] / size, (filmG / 1000) * r[1] / size]; })()
    : s.layers.reduce<[number, number]>((acc, l) => {
        const m = MATERIALS[l.materialId];
        const share = (l.thicknessUm * m.densityGcc) / s.layers.reduce((x, y) => x + y.thicknessUm * MATERIALS[y.materialId].densityGcc, 0);
        return [acc[0] + (filmG / 1000) * share * m.co2eKgPerKg[0] / size, acc[1] + (filmG / 1000) * share * m.co2eKgPerKg[1] / size];
      }, [0, 0]);
  const sustScore = rec.score - Math.min(0.4, ((co2e[0] + co2e[1]) / 2) * 4);

  // --- Consumables & cost item
  let consumables = 0; const cd: string[] = [];
  if (control === "gas-flush") { consumables += 0.6 * units; cd.push("N₂ gas ≈ ₹0.6/pack"); }
  if (control === "absorber" && oxygen?.absorberCc) { consumables += (ABSORBER_PRICE_INR[oxygen.absorberCc] ?? 10) * units; cd.push(`${oxygen.absorberCc} cc absorber sachets`); }
  if (map?.feasible && map.holes > 0) { consumables += 0.4 * units; cd.push("laser micro-perforation ≈ ₹0.4/pack"); }
  const cost: CostItem = {
    portionId: portion.id, supplierProductId: product?.id ?? null, sizeKey: String(size), units,
    consumablesInr: consumables, consumablesDetail: cd.join(", "), labourMinutes: labourMinutes(s, control, units, size),
    serviceId: viaService, outerInr, outerDetail, kg: portion.kg
  };

  const margin = Math.min(marginM, marginO, marginF);
  const cand: Candidate = {
    key: `${portion.id}|${t.id}|${s.id}|${size}|${control}`,
    portionId: portion.id, transportId: t.id, structureId: s.id, structureName: s.name, layersText: s.rigid ? s.name : describeLayers(s), format: s.format,
    packSizeKg: size, units, oxygenControl: control, sealMethod: compat.method, viaService,
    supplierProductId: product?.id ?? null, supplierName: product ? getSupplier(product.supplierId).name : null, documentation: product?.documentation ?? null,
    geometry: geom, support, reasons, conditions, stillToCheck, moisture, oxygen, map, fresh, seal,
    sealNote: compat.reasons.join(" "), cartons, crate, margin: Number.isFinite(margin) ? margin : 99, delayMargin: null,
    sustainability: { filmGPerPack: filmG, filmGPerKgFood: filmG / size, recyclability: rec, co2eKgPerKgFood: co2e, score: sustScore },
    cost, standaloneInr: standaloneCost(cost), evidence, explanation: ""
  };
  // Delay scenario (greater tolerance for delays)
  if (support !== "not-supported") cand.delayMargin = delayMargin(c, s, portion, input, t, size, control, geom, tx, product);
  cand.explanation = explain(c, cand, t, profile);
  if (seal) evidence.push({ label: "Seal", value: `${EQUIPMENT[seal.method].label}${seal.sealTempC ? `, sealant ${seal.sealTempC[0]}–${seal.sealTempC[1]} °C` : ""}, width ≥ ${seal.sealWidthMm} mm`, status: "calculated", note: "Proposed acceptance criteria — expert confirmation pending" });
  return cand;
}

function delayMargin(c: Commodity, s: Structure, portion: Portion, input: AssessmentInput, t: TransportOption, size: number, control: OxygenControl, geom: PackGeometry, tx: (tC: number, rh: number) => { o2: number; h2o: number }, product: SupplierProduct | null): number {
  const profile = [...transitSegments(input.journey, t, DELAY_SCENARIO), storageSegment(input.journey, portion.storage, Math.max(portion.storageDays, 0.01))];
  const target = profile.reduce((a, x) => a + x.days, 0);
  let m = Infinity;
  if (c.moisture) {
    const mi = input.properties.initialMoistureWb ?? c.moisture.initialWb;
    const r = moistureTrajectory({ initialWb: mi.value, criticalWb: c.moisture.criticalWb.value, direction: c.moisture.direction, isoA: c.moisture.isoA.value, isoB: c.moisture.isoB.value, isoRange: c.moisture.isoRange, fillKg: size, areaM2: geom.permeableAreaM2 }, profile, (tC, rh) => tx(tC, rh).h2o * 1.15, 1);
    m = Math.min(m, (r.criticalDayExtended ?? 1e6) / target);
  }
  if (c.oxygen && target > OXIDATION_THRESHOLD_DAYS) {
    const ingress = control === "absorber" ? 0 : oxygenIngressMg(profile, (tC, rh) => tx(tC, rh).o2);
    const hs = control === "absorber" ? 0 : headspaceO2Mg(geom.headspaceL, RESIDUAL_O2[control]);
    const budget = lo(c.oxygen.tolerancePpm) * size;
    m = Math.min(m, ingress + hs > 0 ? budget / (ingress + hs) : 99);
  }
  if (c.respiration) {
    const fl = freshLifeConsumed(c, profile);
    m = Math.min(m, 1 / fl.consumedConservative);
  }
  return Number.isFinite(m) ? Math.min(m, 99) : 99;
}

const fmtDays = (d: number) => (d >= 1e5 ? "no limit reached" : d > 3650 ? "more than 10 years" : `${Math.round(d)} days`);

function explain(c: Commodity, k: Candidate, t: TransportOption, profile: ExposureSegment[]): string {
  const store = profile[profile.length - 1];
  const parts: string[] = [];
  const fam = examplesFor(k.structureId)[0];
  parts.push(`${plainName(k.structureId)} (${k.structureName}) in ${k.packSizeKg} kg packs (${k.units} packs), sent by ${t.label.toLowerCase()}.${fam ? ` It is the same kind of pack as ${fam.products.toLowerCase()}${fam.brands.length ? ` such as ${fam.brands.join(", ")}` : ""}.` : ""}`);
  if (k.moisture) {
    const lead = `Your ${c.name.toLowerCase()} must stay below ${k.moisture.criticalWb}% moisture. In ${store.label.toLowerCase()} at about ${store.tC} °C and ${store.rhPct}% RH (${store.status}),`;
    parts.push(k.moisture.daysP10 > 3650
      ? `${lead} this pack keeps it below the limit for well over the whole period (cautious estimate more than 10 years); you need ${Math.round(k.moisture.targetDays)} days.`
      : `${lead} this pack keeps it below the limit for about ${fmtDays(k.moisture.daysP50)} (cautious estimate ${fmtDays(k.moisture.daysP10)}); you need ${Math.round(k.moisture.targetDays)} days.`);
  }
  if (k.oxygen) parts.push(k.oxygenControl === "none" ? `Oxygen: about ${sig(k.oxygen.ingressMg)} mg enters over the period against a tolerance of ${sig(k.oxygen.budgetMg)} mg per pack.` : `Oxygen is controlled by ${k.oxygenControl === "gas-flush" ? "nitrogen flushing" : k.oxygenControl === "vacuum" ? "vacuum packing" : "an oxygen absorber"}; about ${sig(k.oxygen.ingressMg)} mg enters through the film against a tolerance of ${sig(k.oxygen.budgetMg)} mg.`);
  if (k.map) parts.push(k.map.feasible ? `Gas exchange: ${k.map.reason}` : `Gas exchange problem: ${k.map.reason}`);
  if (k.fresh) parts.push(`Temperature uses about ${Math.round(k.fresh.consumedFraction * 100)}% of the produce's reference storage life.`);
  if (k.conditions.length) parts.push(`It applies only if: ${k.conditions.join(" ")}`);
  if (k.stillToCheck.length) parts.push(`Still to check: ${k.stillToCheck.join(" ")}`);
  return parts.join(" ");
}

// -----------------------------------------------------------------------------
// Order-level plans

function combos<T>(lists: T[][], limit = 400): T[][] {
  let out: T[][] = [[]];
  for (const l of lists) {
    const next: T[][] = [];
    for (const prefix of out) for (const x of l) { next.push([...prefix, x]); if (next.length >= limit) break; }
    out = next;
  }
  return out;
}

function buildPlans(portions: PortionResult[], tOpts: TransportOption[], input: AssessmentInput, settings: CostSettings): OrderPlan[] {
  const active = portions.filter((p) => !p.insufficient);
  if (!active.length) return [];
  const plans: OrderPlan[] = [];
  const mk = (t: TransportOption, sel: Candidate[], tag: OrderPlan["tags"][number]): OrderPlan => {
    const cost = aggregateOrderCost(sel.map((x) => x.cost), t, input.journey.origin, settings);
    const minMargin = Math.min(...sel.map((x) => x.margin));
    const dms = sel.map((x) => x.delayMargin).filter((x): x is number => x !== null);
    return {
      id: `${t.id}:${sel.map((x) => x.key).join(",")}`,
      tags: [tag], transport: t, selections: sel.map((x) => ({ portionId: x.portionId, candidateKey: x.key })),
      cost, deliveryHours: t.transitHours, minMargin, minDelayMargin: dms.length === sel.length ? Math.min(...dms) : null,
      sustainabilityScore: sel.reduce((a, x) => a + x.sustainability.score * x.cost.kg, 0) / sel.reduce((a, x) => a + x.cost.kg, 0),
      overBudget: input.budgetInrPerKg ? cost.perKgInr > input.budgetInrPerKg : false,
      headline: "", whatItCommunicates: ""
    };
  };
  const ok = (x: Candidate) => x.support !== "not-supported" && x.supplierProductId;
  const allCands = new Map(active.flatMap((p) => p.candidates).map((c) => [c.key, c] as const));
  const byT = (tId: string) => active.map((p) => p.candidates.filter((x) => x.transportId === tId && ok(x)));
  const evaluated: OrderPlan[] = [];
  for (const t of tOpts) {
    const lists = byT(t.id);
    if (lists.some((l) => l.length === 0)) continue;
    // cheapest few per portion + those sharing products with other portions (common pouch effect)
    const top = lists.map((l, i) => {
      const sorted = [...l].sort((a, b) => a.standaloneInr - b.standaloneInr);
      const pick = sorted.slice(0, 4);
      const others = lists.flatMap((o, j) => (j === i ? [] : o.slice().sort((a, b) => a.standaloneInr - b.standaloneInr).slice(0, 4)));
      for (const o of others) {
        const same = l.find((x) => x.supplierProductId === o.supplierProductId && x.packSizeKg === o.packSizeKg && x.oxygenControl === o.oxygenControl);
        if (same && !pick.includes(same)) pick.push(same);
      }
      const cheapestSupported = sorted.filter((x) => x.support === "supported").slice(0, 2);
      for (const x of cheapestSupported) if (!pick.includes(x)) pick.push(x);
      const robust = [...l].sort((a, b) => (b.delayMargin ?? 0) - (a.delayMargin ?? 0))[0];
      const green = [...l].sort((a, b) => b.sustainability.score - a.sustainability.score || a.standaloneInr - b.standaloneInr)[0];
      for (const x of [robust, green]) if (x && !pick.includes(x)) pick.push(x);
      return pick;
    });
    for (const sel of combos(top)) evaluated.push(mk(t, sel, "lowest-cost"));
  }
  if (!evaluated.length) return [];
  // Prefer plans in which every portion is fully supported; fall back to conditional options only when needed.
  const fully = evaluated.filter((p) => p.selections.every((s) => allCands.get(s.candidateKey)?.support === "supported"));
  const pool = fully.length ? fully : evaluated;
  const supportedFirst = (a: OrderPlan, b: OrderPlan) => a.cost.totalInr - b.cost.totalInr;
  const cheapest = [...pool].sort(supportedFirst)[0];
  plans.push({ ...cheapest, tags: ["lowest-cost"] });
  const fastestHours = Math.min(...pool.map((p) => p.deliveryHours));
  const faster = pool.filter((p) => p.deliveryHours === fastestHours).sort(supportedFirst)[0];
  if (faster) plans.push({ ...faster, tags: ["faster"] });
  const robust = [...pool].filter((p) => p.minDelayMargin !== null).sort((a, b) => (Math.min(b.minDelayMargin!, 5) - Math.min(a.minDelayMargin!, 5)) || a.cost.totalInr - b.cost.totalInr)[0];
  if (robust) plans.push({ ...robust, tags: ["delay-tolerant"] });
  const green = [...pool].sort((a, b) => b.sustainabilityScore - a.sustainabilityScore || a.cost.totalInr - b.cost.totalInr)[0];
  if (green) plans.push({ ...green, tags: ["sustainable"] });
  // merge identical plans
  const merged: OrderPlan[] = [];
  for (const p of plans) {
    const same = merged.find((m) => m.id === p.id);
    if (same) same.tags.push(...p.tags); else merged.push({ ...p, tags: [...p.tags] });
  }
  const base = merged.find((m) => m.tags.includes("lowest-cost"))!;
  for (const m of merged) {
    const extra = m.cost.totalInr - base.cost.totalInr;
    m.headline = m.tags.map(tagLabel).join(" · ");
    const bits: string[] = [];
    if (m.tags.includes("lowest-cost")) bits.push(`Lowest total among qualifying options and simulated quotations: ₹${fmt(m.cost.totalInr)} (₹${m.cost.perKgInr.toFixed(2)}/kg).`);
    if (m.tags.includes("faster")) bits.push(`Delivers in ≈${Math.round(m.deliveryHours)} h${extra > 0 ? `, ₹${fmt(extra)} more than the lowest-cost plan` : ""}.`);
    if (m.tags.includes("delay-tolerant")) bits.push(`Still within limits if transit is delayed 48 h at +4 °C (lowest margin ×${Math.min(m.minDelayMargin ?? 0, 99).toFixed(1)}). This is wider tolerance of stated conditions — not a claim of general superiority.`);
    if (m.tags.includes("sustainable")) bits.push(`Best documented recyclability / lower indicative packaging footprint among feasible options${extra > 0 ? ` (₹${fmt(extra)} more)` : ""}.`);
    m.whatItCommunicates = bits.join(" ");
  }
  return merged;
}

function compareCommonPouch(portions: PortionResult[], tOpts: TransportOption[], input: AssessmentInput, settings: CostSettings, plans: OrderPlan[]) {
  const out: Recommendation["orderComparison"] = [];
  const base = plans.find((p) => p.tags.includes("lowest-cost"));
  if (!base) return out;
  const retail = portions.filter((p) => p.portion.use === "retail" && !p.insufficient);
  if (retail.length < 2) return out;
  const t = base.transport;
  // Separate best pack for each retail portion (standalone cheapest), versus one common pack for all retail portions.
  const pick = (p: PortionResult) => p.candidates.filter((x) => x.transportId === t.id && x.support !== "not-supported" && x.supplierProductId).sort((a, b) => a.standaloneInr - b.standaloneInr)[0];
  const others = portions.filter((p) => !retail.includes(p) && !p.insufficient).map((p) => { const s = base.selections.find((x) => x.portionId === p.portion.id)!; return p.candidates.find((c) => c.key === s.candidateKey)!; });
  const separate = retail.map(pick);
  if (separate.every(Boolean)) {
    const cost = aggregateOrderCost([...separate, ...others].map((x) => x.cost), t, input.journey.origin, settings);
    out.push({ label: "Different pack for each retail need (each cheapest on its own)", totalInr: cost.totalInr, perKgInr: cost.perKgInr, note: separate.map((x) => `${x.structureName} ${x.packSizeKg} kg${x.oxygenControl !== "none" ? ` + ${x.oxygenControl}` : ""}`).join(" | ") });
  }
  // common: same structure/size/control supported for every retail portion
  const keys = new Map<string, Candidate[]>();
  for (const p of retail) for (const x of p.candidates) {
    if (x.transportId !== t.id || x.support === "not-supported" || !x.supplierProductId) continue;
    const k = `${x.supplierProductId}|${x.packSizeKg}|${x.oxygenControl}`;
    const arr = keys.get(k) ?? [];
    if (!arr.some((y) => y.portionId === x.portionId)) arr.push(x);
    keys.set(k, arr);
  }
  let best: { total: number; perKg: number; note: string } | null = null;
  for (const [, arr] of keys) {
    if (arr.length !== retail.length) continue;
    const cost = aggregateOrderCost([...arr, ...others].map((x) => x.cost), t, input.journey.origin, settings);
    if (!best || cost.totalInr < best.total) best = { total: cost.totalInr, perKg: cost.perKgInr, note: `${arr[0].structureName} ${arr[0].packSizeKg} kg${arr[0].oxygenControl !== "none" ? ` + ${arr[0].oxygenControl}` : ""} for all retail portions` };
  }
  if (best) out.push({ label: "One standard retail pack across the order", totalInr: best.total, perKgInr: best.perKg, note: best.note });
  return out;
}

export const tagLabel = (t: OrderPlan["tags"][number]) => ({ "lowest-cost": "Lowest evaluated cost", faster: "Faster delivery", "delay-tolerant": "Greater tolerance for delays", sustainable: "Sustainable alternative" })[t];
const fmt = (x: number) => Math.round(x).toLocaleString("en-IN");

export { wbToDb, DP_WVTR_TEST };
