// Physical helper functions used by all engine modules.

export const R_KJ = 0.008314; // kJ/(mol·K)
export const O2_MG_PER_CC_STP = 1.429; // mg O2 per cm3 at STP
export const AIR_O2 = 0.209;
export const AIR_CO2 = 0.0004;

/** Saturation vapour pressure of water in Pa (Magnus–Alduchov form, BUCK source). */
export function psat(tC: number): number {
  return 610.94 * Math.exp((17.625 * tC) / (tC + 243.04));
}

/** Arrhenius factor to convert a permeation rate from tRefC to tC. */
export function arrhenius(eKJ: number, tRefC: number, tC: number): number {
  const tr = tRefC + 273.15;
  const t = tC + 273.15;
  return Math.exp((eKJ / R_KJ) * (1 / tr - 1 / t));
}

export const wbToDb = (wbPct: number) => wbPct / (100 - wbPct);
export const dbToWb = (db: number) => (100 * db) / (1 + db);

/** Deterministic PRNG (mulberry32) so Monte Carlo results are reproducible. */
export function rng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular sample between lo and hi with mode — keeps the central value most likely. */
export function triangular(r: number, lo: number, mode: number, hi: number): number {
  if (hi <= lo) return mode;
  const c = (mode - lo) / (hi - lo);
  return r < c ? lo + Math.sqrt(r * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - r) * (hi - lo) * (hi - mode));
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function summarize(samples: number[]) {
  const s = samples.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), n: s.length };
}

export const round = (x: number, d = 2) => {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

/** Significant-figure formatting for display of physical quantities. */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "–";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e5) return x.toExponential(1);
  const d = Math.max(0, n - 1 - Math.floor(Math.log10(abs)));
  return x.toFixed(Math.min(d, 4));
}
