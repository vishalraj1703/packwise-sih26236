// Gap 1 (moisture) — deriving required WVTR for a dry food from its sorption
// behaviour, the pack geometry and the full exposure profile (transit + storage).
//
// Model (LABUZA): with a linear isotherm M = a + b·aw and constant conditions,
//   M(t) = Me − (Me − M0)·exp(−k·t),   k = P'·A·p0(T) / (Ws·b),   Me = a + b·RH
// applied piecewise across exposure segments. The required permeance is found
// by bisection so that the moisture at the end of the profile equals Mc.
import { DP_WVTR_TEST, GENERIC_E_H2O, WVTR_TEST } from "./barrier";
import { arrhenius, psat, wbToDb } from "./physics";

export interface ExposureSegment {
  label: string;
  days: number;
  tC: number;
  rhPct: number;
  status: "forecast" | "measured" | "assumed" | "user";
}

export interface MoistureInputs {
  initialWb: number;
  criticalWb: number;
  isoA: number;
  isoB: number;
  isoRange: [number, number];
  fillKg: number;
  areaM2: number;
  direction?: "gain" | "loss";
}

export interface MoistureTrace {
  day: number;
  moistureWb: number;
}

/** Moisture trajectory for a given pack water-vapour conductance function (g/(day·Pa) at temperature). */
export function moistureTrajectory(
  inp: MoistureInputs,
  profile: ExposureSegment[],
  conductanceAt: (tC: number, rhPct: number) => number,
  steps = 8
) {
  const solidsG = inp.fillKg * 1000 * (1 - inp.initialWb / 100);
  const mc = wbToDb(inp.criticalWb);
  let m = wbToDb(inp.initialWb);
  const trace: MoistureTrace[] = [{ day: 0, moistureWb: inp.initialWb }];
  let day = 0;
  let criticalDay: number | null = null;
  let extrapolated = false;
  const gaining = (inp.direction ?? "gain") === "gain";
  if ((gaining && m >= mc) || (!gaining && m <= mc)) {
    return { trace, finalWb: inp.initialWb, criticalDay: 0, criticalDayExtended: 0, extrapolated: false, totalDays: profile.reduce((a, x) => a + x.days, 0) };
  }
  for (const seg of profile) {
    const me = inp.isoA + inp.isoB * (seg.rhPct / 100);
    if (seg.rhPct / 100 > inp.isoRange[1] + 0.05 || seg.rhPct / 100 < inp.isoRange[0] - 0.05) extrapolated = true;
    const k = (conductanceAt(seg.tC, seg.rhPct) * psat(seg.tC)) / (solidsG * inp.isoB);
    const m0 = m;
    // time to critical in this segment
    if (criticalDay === null && ((gaining && me > mc && m0 < mc) || (!gaining && me < mc && m0 > mc))) {
      const t = Math.log((me - m0) / (me - mc)) / k;
      if (t <= seg.days) criticalDay = day + t;
    }
    for (let i = 1; i <= steps; i++) {
      const t = (seg.days * i) / steps;
      const mt = me - (me - m0) * Math.exp(-k * t);
      trace.push({ day: day + t, moistureWb: (100 * mt) / (1 + mt) });
    }
    m = me - (me - m0) * Math.exp(-k * seg.days);
    day += seg.days;
  }
  if (criticalDay === null && ((gaining && m >= mc) || (!gaining && m <= mc))) criticalDay = day;
  // Time-to-critical beyond the profile: extend with the last segment's conditions.
  let criticalDayExtended = criticalDay;
  if (criticalDay === null && profile.length > 0) {
    const last = profile[profile.length - 1];
    const me = inp.isoA + inp.isoB * (last.rhPct / 100);
    const k = (conductanceAt(last.tC, last.rhPct) * psat(last.tC)) / (solidsG * inp.isoB);
    if ((gaining && me > mc) || (!gaining && me < mc)) criticalDayExtended = day + Math.log((me - m) / (me - mc)) / k;
    else criticalDayExtended = Infinity; // equilibrium never reaches the limit
  }
  return { trace, finalWb: (100 * m) / (1 + m), criticalDay, criticalDayExtended, extrapolated, totalDays: day };
}

/**
 * Required WVTR expressed at the standard test condition (38 °C / 90 % RH),
 * assuming a generic permeation activation energy to translate between
 * storage and test temperatures. Returns g/(m²·day).
 */
export function requiredWvtr(inp: MoistureInputs, profile: ExposureSegment[]): { wvtrTest: number; alwaysOk: boolean; neverOk: boolean } {
  const conductance = (wvtrTest: number) => (tC: number) => ((wvtrTest / DP_WVTR_TEST) * arrhenius(GENERIC_E_H2O, WVTR_TEST.tC, tC)) * inp.areaM2;
  const ok = (w: number) => moistureTrajectory(inp, profile, conductance(w), 1).criticalDay === null;
  // Is the food already beyond the limit or does ambient never push it there?
  if (ok(1e6)) return { wvtrTest: Infinity, alwaysOk: true, neverOk: false };
  if (!ok(1e-6)) return { wvtrTest: 0, alwaysOk: false, neverOk: true };
  let lo = 1e-6, hi = 1e6;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return { wvtrTest: lo, alwaysOk: false, neverOk: false };
}
