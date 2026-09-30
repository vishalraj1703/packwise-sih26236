// Gap 3 — Modified Atmosphere Packaging and micro-perforation for fresh produce.
//
// Steady state (per gas):   G·(y_out − y_in) = R(y_in)·W
//   G   = film conductance (OTR·A) + n·K_hole        [mL(STP)/(day·atm)]
//   R   = respiration, Q10 temperature dependence and Michaelis–Menten O2 dependence
//   K_hole = D_gas·π r² / (L + r) · 273.15/T  (Fick diffusion with end correction, FISHMAN)
// Uncertainty is propagated by Monte Carlo over respiration, Q10, RQ, Km,
// film variability and temperature (GUILLARD), and reported as probabilities.
import type { Commodity } from "../types";
import type { ExposureSegment } from "./moisture";
import { AIR_CO2, AIR_O2, rng, summarize, triangular } from "./physics";

export const MG_CO2_TO_ML = 22.414 / 44.01;
export const HOLE_DIAMETERS_UM = [60, 90, 120, 200];

export interface RespParams {
  rco2At20: number; // mg/kg/h
  q10: number;
  rq: number;
  km: number;
}

/** O2 consumption, mL(STP)/(kg·day), at O2 fraction y and temperature tC. */
export function respirationO2(y: number, tC: number, p: RespParams): number {
  const rco2Air = p.rco2At20 * Math.pow(p.q10, (tC - 20) / 10) * MG_CO2_TO_ML * 24; // mL CO2/kg/day in air
  const ro2Air = rco2Air / p.rq;
  const yy = Math.max(y, 0);
  return ro2Air * (yy / (p.km + yy)) * ((p.km + AIR_O2) / AIR_O2);
}

/** Per-hole conductance, mL(STP)/(day·atm). */
export function holeConductance(diameterUm: number, filmUm: number, tC: number, gas: "O2" | "CO2"): number {
  const tK = tC + 273.15;
  const d20 = gas === "O2" ? 0.2 : 0.16; // cm²/s in air at 20 °C
  const D = d20 * Math.pow(tK / 293.15, 1.75);
  const r = (diameterUm / 2) * 1e-4; // cm
  const L = filmUm * 1e-4;
  const area = Math.PI * r * r;
  return ((D * area) / (L + r)) * (273.15 / tK) * 86400;
}

export interface Conductance {
  gO2: number; // mL/(day·atm)
  gCO2: number;
}

export function equilibrium(g: Conductance, fillKg: number, tC: number, p: RespParams) {
  let lo = 0, hi = AIR_O2;
  const f = (y: number) => g.gO2 * (AIR_O2 - y) - respirationO2(y, tC, p) * fillKg;
  if (f(1e-6) <= 0) return { o2: 0, co2: AIR_CO2 + (p.rq * respirationO2(1e-6, tC, p) * fillKg) / g.gCO2 };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  const o2 = (lo + hi) / 2;
  const co2 = AIR_CO2 + (p.rq * respirationO2(o2, tC, p) * fillKg) / g.gCO2;
  return { o2, co2: Math.min(co2, 0.99) };
}

export interface MapDesign {
  feasible: boolean;
  reason: string;
  holeDiameterUm: number | null;
  holes: number;
  holesRange: [number, number];
  equilibriumAtStorage: { o2: number; co2: number };
  bySegment: Array<{ label: string; tC: number; o2: number; co2: number; inWindow: boolean; anaerobic: boolean }>;
  probability: { inWindow: number; anaerobic: number; co2Injury: number; samples: number };
  o2Dist: { p10: number; p50: number; p90: number };
  co2Dist: { p10: number; p50: number; p90: number };
  transient: Array<{ day: number; o2: number; co2: number }>;
  daysToEquilibrium: number | null;
}

const central = (c: Commodity): RespParams => {
  const r = c.respiration!;
  return { rco2At20: r.rco2At20.value, q10: r.q10.value, rq: r.rq.value, km: r.kmO2.value };
};

/**
 * Design micro-perforation for a film pack.
 * filmO2At(tC) returns the film-only O2 conductance (OTR·A) at temperature; beta is film CO2/O2 ratio.
 */
export function designMap(
  c: Commodity,
  fillKg: number,
  filmUm: number,
  filmO2At: (tC: number) => number,
  beta: number,
  freeVolumeL: number,
  profile: ExposureSegment[],
  storageTC: number,
  mcSamples = 400
): MapDesign {
  const r = c.respiration!;
  const p = central(c);
  const yT = (r.targetO2[0] + r.targetO2[1]) / 2;
  const need = (respirationO2(yT, storageTC, p) * fillKg) / (AIR_O2 - yT);
  const film = filmO2At(storageTC);
  let best: { d: number; n: number } | null = null;
  let reason = "";
  if (film > need * 1.05) {
    reason = `Film alone admits too much oxygen (${film.toFixed(0)} vs ${need.toFixed(0)} mL/day·atm needed): O₂ cannot fall into the ${pct(r.targetO2[0])}–${pct(r.targetO2[1])} window. Use a lower-permeability film or a larger fill.`;
  } else {
    // choose the smallest standard hole diameter giving a practical hole count (1..60)
    for (const d of HOLE_DIAMETERS_UM) {
      const k = holeConductance(d, filmUm, storageTC, "O2");
      const n = Math.max(0, Math.round((need - film) / k));
      if (n <= 60) { best = { d, n }; break; }
    }
    if (!best) reason = "Required gas exchange needs more than 60 perforations of 200 µm — use a more permeable film or macro-perforation / vented pack.";
  }
  const holes = best?.n ?? 0;
  const d = best?.d ?? HOLE_DIAMETERS_UM[0];
  const cond = (tC: number, jitterFilm = 1, jitterHole = 1): Conductance => {
    const fo = filmO2At(tC) * jitterFilm;
    const ko = holeConductance(d * jitterHole, filmUm, tC, "O2") * holes;
    const kc = holeConductance(d * jitterHole, filmUm, tC, "CO2") * holes;
    return { gO2: fo + ko, gCO2: fo * beta + kc };
  };
  const eqStore = equilibrium(cond(storageTC), fillKg, storageTC, p);
  const bySegment = profile.map((s) => {
    const e = equilibrium(cond(s.tC), fillKg, s.tC, p);
    return { label: s.label, tC: s.tC, o2: e.o2, co2: e.co2, inWindow: inWin(e, r), anaerobic: e.o2 < r.minO2 };
  });
  // Monte Carlo over biological variability, film/hole variability and temperature deviation.
  const rand = rng(1234);
  const o2s: number[] = [], co2s: number[] = [];
  let inW = 0, anaer = 0, inj = 0;
  const lo = (e: { lo?: number; value: number }) => e.lo ?? e.value;
  const hi = (e: { hi?: number; value: number }) => e.hi ?? e.value;
  for (let i = 0; i < mcSamples; i++) {
    const ps: RespParams = {
      rco2At20: triangular(rand(), lo(r.rco2At20), r.rco2At20.value, hi(r.rco2At20)),
      q10: triangular(rand(), lo(r.q10), r.q10.value, hi(r.q10)),
      rq: triangular(rand(), lo(r.rq), r.rq.value, hi(r.rq)),
      km: triangular(rand(), lo(r.kmO2), r.kmO2.value, hi(r.kmO2))
    };
    const tC = storageTC + triangular(rand(), -2, 0, 2); // ±2 °C storage control (assumption)
    const e = equilibrium(cond(tC, triangular(rand(), 0.85, 1, 1.15), triangular(rand(), 0.9, 1, 1.1)), fillKg, tC, ps);
    o2s.push(e.o2); co2s.push(e.co2);
    if (inWin(e, r)) inW++;
    if (e.o2 < r.minO2) anaer++;
    if (e.co2 > r.maxCo2) inj++;
  }
  // holes range covering P10–P90 respiration
  const needAt = (rc: number) => (respirationO2(yT, storageTC, { ...p, rco2At20: rc }) * fillKg) / (AIR_O2 - yT);
  const kHole = holeConductance(d, filmUm, storageTC, "O2");
  const holesRange: [number, number] = [
    Math.max(0, Math.round((needAt(lo(r.rco2At20)) - film) / kHole)),
    Math.max(0, Math.round((needAt(hi(r.rco2At20)) - film) / kHole))
  ];
  const transient = simulateTransient(cond, fillKg, freeVolumeL, profile, p);
  const probability = { inWindow: inW / mcSamples, anaerobic: anaer / mcSamples, co2Injury: inj / mcSamples, samples: mcSamples };
  const feasible = !!best && probability.anaerobic < 0.05 && probability.inWindow >= 0.5 && bySegment.every((s) => !s.anaerobic);
  if (best && !feasible) {
    const bad = bySegment.find((s) => s.anaerobic);
    reason = bad
      ? `At ${bad.tC.toFixed(0)} °C during "${bad.label}" respiration outpaces gas exchange and O₂ falls to ${pct(bad.o2)} — anaerobic risk. Reduce transit temperature or add perforations.`
      : `Only ${(probability.inWindow * 100).toFixed(0)}% of simulated cases stay inside the target window (anaerobic risk ${(probability.anaerobic * 100).toFixed(0)}%).`;
  } else if (feasible) {
    reason = `${holes} × ${d} µm perforations bring O₂ to ≈${pct(eqStore.o2)} and CO₂ to ≈${pct(eqStore.co2)} at ${storageTC} °C.`;
  }
  return {
    feasible,
    reason,
    holeDiameterUm: best ? d : null,
    holes,
    holesRange,
    equilibriumAtStorage: eqStore,
    bySegment,
    probability,
    o2Dist: summarize(o2s),
    co2Dist: summarize(co2s),
    transient: transient.trace,
    daysToEquilibrium: transient.daysToEq
  };
}

function inWin(e: { o2: number; co2: number }, r: NonNullable<Commodity["respiration"]>) {
  // Allow ±0.5 percentage-point tolerance around the recommended window.
  return e.o2 >= r.targetO2[0] - 0.005 && e.o2 <= r.targetO2[1] + 0.005 && e.co2 <= r.maxCo2;
}

export const pct = (y: number) => `${(y * 100).toFixed(1)}%`;

/** Headspace dynamics from packing (air) through the exposure profile. Euler steps of 0.5 h. */
export function simulateTransient(cond: (tC: number) => Conductance, fillKg: number, freeVolumeL: number, profile: ExposureSegment[], p: RespParams) {
  const V = Math.max(freeVolumeL, 0.05) * 1000; // mL
  let o2 = AIR_O2, co2 = AIR_CO2, t = 0;
  const dt = 0.5 / 24;
  const trace: Array<{ day: number; o2: number; co2: number }> = [{ day: 0, o2, co2 }];
  let daysToEq: number | null = null;
  let nextSample = 0.25;
  for (const seg of profile) {
    const g = cond(seg.tC);
    const steps = Math.ceil(seg.days / dt);
    for (let i = 0; i < steps; i++) {
      const rO2 = respirationO2(o2, seg.tC, p) * fillKg;
      const dO2 = (g.gO2 * (AIR_O2 - o2) - rO2) / V;
      const dCO2 = (g.gCO2 * (AIR_CO2 - co2) + p.rq * rO2) / V;
      o2 = Math.min(Math.max(o2 + dO2 * dt, 0), AIR_O2);
      co2 = Math.min(Math.max(co2 + dCO2 * dt, 0), 0.99);
      t += dt;
      if (daysToEq === null && Math.abs(dO2) < 0.0005 && t > 0.1) daysToEq = t;
      if (t >= nextSample) { trace.push({ day: t, o2, co2 }); nextSample += Math.max(0.25, seg.days / 40); }
    }
  }
  return { trace, daysToEq };
}
