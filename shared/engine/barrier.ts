// Gap 2 — translating protection requirements into structure and thickness.
// Multilayer transmission uses the series-resistance model: 1/T_total = Σ 1/T_i,
// with polymer layers scaled inversely with thickness and coatings/foil fixed.
import type { Layer, Structure } from "../types";
import { MATERIALS, COMMON_GAUGES_UM } from "../data/materials";
import { arrhenius, psat } from "./physics";
import { rigidScale } from "./geometry";

export const WVTR_TEST = { tC: 38, rh: 90 };
export const OTR_TEST = { tC: 23, rh: 0 };
export const DP_WVTR_TEST = psat(WVTR_TEST.tC) * (WVTR_TEST.rh / 100); // Pa
export const GENERIC_E_O2 = 35; // kJ/mol used to express requirements at test conditions
export const GENERIC_E_H2O = 45;

function layerOtr(l: Layer, tC: number, rhPct: number): number {
  const m = MATERIALS[l.materialId];
  let base = m.otrRef;
  if (m.otrRefHighRh !== undefined) {
    const f = Math.min(Math.max(rhPct / 80, 0), 1.25);
    base = m.otrRef + (m.otrRefHighRh - m.otrRef) * f;
  }
  const thk = m.thicknessScalable ? m.refThicknessUm / l.thicknessUm : 1;
  return base * thk * arrhenius(m.ePermO2kJ, OTR_TEST.tC, tC);
}

/** Water-vapour permeance of a layer, g/(m²·day·Pa). */
function layerPermeance(l: Layer, tC: number): number {
  const m = MATERIALS[l.materialId];
  const thk = m.thicknessScalable ? m.refThicknessUm / l.thicknessUm : 1;
  return (m.wvtrRef / DP_WVTR_TEST) * thk * arrhenius(m.ePermH2OkJ, WVTR_TEST.tC, tC);
}

const series = (vals: number[]) => (vals.length === 0 ? Infinity : 1 / vals.reduce((s, v) => s + 1 / v, 0));

export interface BarrierAt {
  /** cc(STP)/(m²·day·atm) at the stated temperature and humidity */
  otr: number;
  /** g/(m²·day·Pa) */
  permeanceH2O: number;
  /** CO2 transmission, cc/(m²·day·atm) */
  co2tr: number;
}

/** Barrier of a flexible structure per m² at a given condition. */
export function structureBarrier(s: Structure, tC: number, rhPct: number): BarrierAt {
  // Humidity inside a layer stack differs from the outside; use a mid value for humidity-sensitive layers.
  const midRh = Math.max(rhPct * 0.75, 40);
  const otrs = s.layers.map((l) => layerOtr(l, tC, midRh));
  const otr = series(otrs);
  const co2 = series(s.layers.map((l, i) => otrs[i] * MATERIALS[l.materialId].co2O2Ratio));
  const perm = series(s.layers.map((l) => layerPermeance(l, tC)));
  return { otr, permeanceH2O: perm, co2tr: co2 };
}

/** Per-pack transmission (for both flexible and rigid). */
export function packTransmission(s: Structure, areaM2: number, fillKg: number, tC: number, rhPct: number) {
  if (s.rigid) {
    const k = rigidScale(s, fillKg);
    const fT = arrhenius(30, 23, tC);
    return {
      o2CcPerDayAtm: s.rigid.otrPerPackCcDay * k * fT / 0.209, // per-pack values are quoted in air
      h2oGPerDayPa: (s.rigid.wvtrPerPackGDay * k * arrhenius(40, 38, tC)) / DP_WVTR_TEST,
      co2CcPerDayAtm: (s.rigid.otrPerPackCcDay * k * fT * 4) / 0.209
    };
  }
  const b = structureBarrier(s, tC, rhPct);
  return { o2CcPerDayAtm: b.otr * areaM2, h2oGPerDayPa: b.permeanceH2O * areaM2, co2CcPerDayAtm: b.co2tr * areaM2 };
}

/** Values at standard test conditions — what a supplier's datasheet should state. */
export function structureAtTest(s: Structure) {
  if (s.rigid) return { otr: NaN, wvtr: NaN };
  const otr = structureBarrier(s, OTR_TEST.tC, 0).otr;
  const wvtr = structureBarrier(s, WVTR_TEST.tC, WVTR_TEST.rh).permeanceH2O * DP_WVTR_TEST;
  return { otr, wvtr };
}

export function totalThicknessUm(s: Structure) {
  return s.layers.reduce((a, l) => a + l.thicknessUm, 0);
}

/**
 * Minimum thickness of a single polymer to meet a requirement at test conditions,
 * rounded up to a commonly available gauge.
 */
export function minimumGauge(materialId: string, otrReq?: number, wvtrReq?: number) {
  const m = MATERIALS[materialId];
  if (!m.thicknessScalable) return null;
  let needed = 0;
  if (otrReq && otrReq > 0) needed = Math.max(needed, (m.otrRef * m.refThicknessUm) / otrReq);
  if (wvtrReq && wvtrReq > 0) needed = Math.max(needed, (m.wvtrRef * m.refThicknessUm) / wvtrReq);
  const gauge = COMMON_GAUGES_UM.find((g) => g >= needed);
  return { materialId, exactUm: needed, gaugeUm: gauge ?? null, practical: gauge !== undefined && needed <= 200 };
}

export function describeLayers(s: Structure) {
  return s.layers.map((l) => `${MATERIALS[l.materialId].commonName} ${l.thicknessUm} µm`).join(" / ");
}

export function recyclability(s: Structure) {
  if (s.rigid) {
    const f = s.rigid.family;
    return {
      family: f,
      label: f === "metal" ? "Metal — widely collected" : f === "glass" ? "Glass — recyclable / reusable" : f === "PET" ? "PET rigid — collected in many cities" : "Rigid plastic — reusable crate",
      pwmCategory: f === "metal" || f === "glass" ? "Not plastic (outside PWM categories)" : "Category I (rigid plastic)",
      score: f === "PP" ? 0.9 : f === "glass" ? 0.8 : f === "metal" ? 0.8 : 0.7
    };
  }
  const fams = new Set(s.layers.map((l) => MATERIALS[l.materialId].family));
  const mass = (fam: string) => s.layers.filter((l) => MATERIALS[l.materialId].family === fam).reduce((a, l) => a + l.thicknessUm * MATERIALS[l.materialId].densityGcc, 0);
  const total = s.layers.reduce((a, l) => a + l.thicknessUm * MATERIALS[l.materialId].densityGcc, 0);
  const hasNonPlastic = [...fams].some((f) => f === "metal" || f === "paper");
  if (fams.size === 1 && (fams.has("PE") || fams.has("PP"))) {
    return { family: [...fams][0], label: `Mono-material ${[...fams][0]} — recyclable where flexible-film collection exists`, pwmCategory: "Category II (flexible plastic)", score: 0.75 };
  }
  if (fams.has("compostable") && fams.size === 1) {
    return { family: "compostable", label: "Compostable — only under suitable (usually industrial) composting", pwmCategory: "Category IV (compostable plastic)", score: 0.55 };
  }
  // PE-dominant with minor barrier layer
  const peShare = mass("PE") / total;
  if (peShare >= 0.9 && !hasNonPlastic) {
    return { family: "PE", label: "PE-based design for recycling (minor EVOH layer) — verify with local recycler", pwmCategory: "Category II (flexible plastic)", score: 0.6 };
  }
  if (hasNonPlastic) {
    return { family: "multi-material", label: "Multi-layer with metal/paper — not mechanically recyclable in common streams", pwmCategory: "Category III (multilayered plastic)", score: 0.15 };
  }
  return { family: "mixed-plastic", label: "Mixed plastics laminate — limited recyclability", pwmCategory: "Category II (flexible plastic)", score: 0.3 };
}
