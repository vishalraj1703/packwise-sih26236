// Gap 1 (oxygen) — required OTR from an oxygen budget, plus headspace oxygen
// and oxygen-control sizing (flush / vacuum / absorber).
//
// Budget (SALAME class tolerance): O2_allowed [mg] = tolerance [mg/kg] × food mass [kg].
// Ingress over the exposure profile: Σ OTR(T)·A·ΔpO2·days·1.429 mg/cc.
// Required OTR at test conditions is solved in closed form using a generic
// activation energy to translate storage temperatures to the 23 °C test.
import { GENERIC_E_O2, OTR_TEST } from "./barrier";
import type { ExposureSegment } from "./moisture";
import { AIR_O2, O2_MG_PER_CC_STP, arrhenius } from "./physics";

export type OxygenControl = "none" | "vacuum" | "gas-flush" | "absorber";

export const RESIDUAL_O2: Record<OxygenControl, number> = {
  none: AIR_O2,
  vacuum: 0.01, // of a much smaller residual volume
  "gas-flush": 0.02, // typical achievable residual with N2 flushing (assumption; measure with a headspace analyser)
  absorber: 0.001
};

export const ABSORBER_SIZES_CC = [20, 30, 50, 100, 200, 300, 500, 1000, 2000];

export function headspaceO2Mg(headspaceL: number, residualFraction: number, tC = 25): number {
  // n = PV/RT → mg = V[L]·y·(1/(0.08206·T))·32000
  return headspaceL * residualFraction * (1 / (0.08206 * (tC + 273.15))) * 32000;
}

export function oxygenIngressMg(profile: ExposureSegment[], o2CcPerDayAtmAt: (tC: number, rhPct: number) => number, insideO2 = 0): number {
  return profile.reduce((s, seg) => s + o2CcPerDayAtmAt(seg.tC, seg.rhPct) * (AIR_O2 - insideO2) * seg.days * O2_MG_PER_CC_STP, 0);
}

/** Required OTR (cc/m²·day·atm at 23 °C, 0 % RH) so ingress stays within the budget. */
export function requiredOtr(toleranceMgPerKg: number, fillKg: number, areaM2: number, profile: ExposureSegment[]): number {
  const budget = toleranceMgPerKg * fillKg;
  const denom = profile.reduce((s, seg) => s + areaM2 * AIR_O2 * seg.days * O2_MG_PER_CC_STP * arrhenius(GENERIC_E_O2, OTR_TEST.tC, seg.tC), 0);
  return denom > 0 ? budget / denom : Infinity;
}

export function sizeAbsorber(headspaceL: number, ingressMg: number, safety = 1.3) {
  // Absorber capacity rated in cc of O2 absorbed.
  const headspaceCc = headspaceL * 1000 * AIR_O2;
  const ingressCc = ingressMg / O2_MG_PER_CC_STP;
  const needed = (headspaceCc + ingressCc) * safety;
  const size = ABSORBER_SIZES_CC.find((s) => s >= needed);
  return { neededCc: needed, sachetCc: size ?? null, sachets: size ? 1 : Math.ceil(needed / ABSORBER_SIZES_CC[ABSORBER_SIZES_CC.length - 1]) };
}
