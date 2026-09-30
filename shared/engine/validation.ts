// Gap 5 — validation and benefit claims.
// Trials are pre-registered (acceptance thresholds locked before data entry),
// analysed with standard statistics, and claims are generated only from what
// the data support, with their conditions attached.

// ---- statistics helpers -----------------------------------------------------
export function normInv(p: number): number {
  // Acklam's rational approximation
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function lgamma(x: number): number {
  const g = 7, cof = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = cof[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += cof[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student t with df degrees of freedom. */
export function tTwoSidedP(t: number, df: number): number {
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

export function tInv(p: number, df: number): number {
  // bisection on the CDF
  let lo = 0, hi = 100;
  const target = 2 * (1 - p); // two-sided tail mass
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const variance = (x: number[]) => { const m = mean(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1); };

// ---- sample size -------------------------------------------------------------
export function sampleSizeMeans(sd: number, delta: number, alpha = 0.05, power = 0.8) {
  const z = normInv(1 - alpha / 2) + normInv(power);
  return Math.ceil((2 * z * z * sd * sd) / (delta * delta));
}

export function sampleSizeProportions(p1: number, p2: number, alpha = 0.05, power = 0.8) {
  const za = normInv(1 - alpha / 2), zb = normInv(power);
  const pbar = (p1 + p2) / 2;
  const n = (za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p1 - p2) ** 2;
  return Math.ceil(n);
}

// ---- analysis ----------------------------------------------------------------
export interface WelchResult { meanControl: number; meanTreatment: number; diff: number; ci: [number, number]; df: number; t: number; p: number; nC: number; nT: number }

export function welch(control: number[], treatment: number[], conf = 0.95): WelchResult | null {
  if (control.length < 2 || treatment.length < 2) return null;
  const mc = mean(control), mt = mean(treatment), vc = variance(control), vt = variance(treatment);
  const se2 = vc / control.length + vt / treatment.length;
  const se = Math.sqrt(se2);
  const df = se2 ** 2 / ((vc / control.length) ** 2 / (control.length - 1) + (vt / treatment.length) ** 2 / (treatment.length - 1));
  const diff = mt - mc;
  const t = se > 0 ? diff / se : 0;
  const tc = tInv((1 + conf) / 2, df);
  return { meanControl: mc, meanTreatment: mt, diff, ci: [diff - tc * se, diff + tc * se], df, t, p: se > 0 ? tTwoSidedP(t, df) : 1, nC: control.length, nT: treatment.length };
}

export function twoProportions(xC: number, nC: number, xT: number, nT: number, conf = 0.95) {
  const pC = xC / nC, pT = xT / nT;
  const z = normInv((1 + conf) / 2);
  // Newcombe hybrid score interval using Wilson intervals of each proportion
  const wilson = (x: number, n: number) => {
    const p = x / n, den = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / den;
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
    return [centre - half, centre + half];
  };
  const [lC, uC] = wilson(xC, nC), [lT, uT] = wilson(xT, nT);
  const diff = pT - pC;
  const lo = diff - Math.sqrt((pT - lT) ** 2 + (uC - pC) ** 2);
  const hi = diff + Math.sqrt((uT - pT) ** 2 + (pC - lC) ** 2);
  const pooled = (xC + xT) / (nC + nT);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nC + 1 / nT));
  const zStat = se > 0 ? diff / se : 0;
  const p = se > 0 ? 2 * (1 - normCdf(Math.abs(zStat))) : 1;
  return { pC, pT, diff, ci: [lo, hi] as [number, number], p };
}

export function normCdf(x: number) {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// ---- accelerated shelf-life (Q10) -------------------------------------------
export function q10FromTwoTemps(shelfDaysT1: number, t1: number, shelfDaysT2: number, t2: number) {
  // Q10 = (θ_T1 / θ_T2)^(10 / (T2 − T1)), T2 > T1
  return Math.pow(shelfDaysT1 / shelfDaysT2, 10 / (t2 - t1));
}

export function extrapolateShelfLife(shelfDaysAtT: number, tTest: number, tTarget: number, q10: number) {
  return shelfDaysAtT * Math.pow(q10, (tTest - tTarget) / 10);
}

// ---- model evaluation ---------------------------------------------------------
export function predictionError(pairs: Array<{ predicted: number; observed: number }>) {
  if (!pairs.length) return null;
  const errs = pairs.map((p) => p.predicted - p.observed);
  return {
    n: pairs.length,
    bias: mean(errs),
    mae: mean(errs.map(Math.abs)),
    rmse: Math.sqrt(mean(errs.map((e) => e * e)))
  };
}

// ---- pre-registration and decisions -----------------------------------------
export interface TrialThreshold {
  metric: string;
  direction: "treatment-higher" | "treatment-lower";
  minimumDifference: number; // practical significance
  unit: string;
}

export type TrialDecision = "meets-threshold" | "inconclusive" | "does-not-meet";

/** Decide against the locked threshold using the CI (not just the p-value). */
export function decide(ci: [number, number], th: TrialThreshold): TrialDecision {
  const [lo, hi] = ci;
  if (th.direction === "treatment-higher") {
    if (lo >= th.minimumDifference) return "meets-threshold";
    if (hi < th.minimumDifference) return "does-not-meet";
    return "inconclusive";
  }
  if (hi <= -th.minimumDifference) return "meets-threshold";
  if (lo > -th.minimumDifference) return "does-not-meet";
  return "inconclusive";
}

/** Claims are generated only from locked, completed trials — with conditions attached. */
export function claimText(decision: TrialDecision, th: TrialThreshold, ci: [number, number], ctx: { commodity: string; control: string; treatment: string; days: number; conditions: string; n: string }) {
  const range = `${ci[0].toFixed(2)} to ${ci[1].toFixed(2)} ${th.unit}`;
  if (decision === "meets-threshold") {
    return `In a comparative trial (${ctx.n}) of ${ctx.commodity} over ${ctx.days} days under ${ctx.conditions}, ${ctx.treatment} differed from ${ctx.control} in ${th.metric} by ${range} (95% CI), meeting the pre-registered threshold of ${th.minimumDifference} ${th.unit}. This result applies to these conditions and does not establish a general shelf-life claim.`;
  }
  if (decision === "inconclusive") {
    return `The trial was inconclusive for ${th.metric}: the 95% CI (${range}) includes differences below the pre-registered threshold. No benefit claim should be made; consider a larger trial.`;
  }
  return `The trial did not show the pre-registered improvement in ${th.metric} (95% CI ${range}). No benefit claim is supported.`;
}

/** Simple, stable hash for locking pre-registrations (FNV-1a, hex). */
export function lockHash(obj: unknown): string {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
