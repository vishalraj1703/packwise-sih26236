import { claimText, decide, predictionError, twoProportions, welch, sampleSizeMeans, sampleSizeProportions, type TrialDecision } from "./validation";
import { getCommodity } from "../data/commodities";

export interface TrialMetric {
  key: string;
  label: string;
  unit: string; // for proportions: "pp" (percentage points)
  type: "continuous" | "proportion";
  direction: "treatment-higher" | "treatment-lower";
  minimumDifference: number;
}

export interface TrialDesign {
  commodityId: string;
  control: string;
  treatment: string;
  conditions: string;
  durationDays: number;
  checkpointsDays: number[];
  unitsPerArm: number;
  primaryMetric: string;
  metrics: TrialMetric[];
  predictions?: Array<{ metric: string; day: number; predicted: number }>;
  assessmentId?: number;
  candidateKey?: string;
  expertReviewer?: string;
}

/** For continuous metrics `value` is one measurement; for proportions `value` = successes out of `n`. */
export interface Observation { arm: "control" | "treatment"; metric: string; day: number; value: number; n?: number; sampleId?: string; note?: string; recordedAt?: string }

export interface MetricAnalysis {
  metric: TrialMetric;
  day: number | null;
  control: string;
  treatment: string;
  diff: number | null;
  ci: [number, number] | null;
  p: number | null;
  decision: TrialDecision | "insufficient-data";
  claim: string | null;
}

export function analyzeTrial(design: TrialDesign, obs: Observation[]) {
  const commodity = (() => { try { return getCommodity(design.commodityId).name; } catch { return design.commodityId; } })();
  const metrics: MetricAnalysis[] = design.metrics.map((m) => {
    const rows = obs.filter((o) => o.metric === m.key);
    const days = [...new Set(rows.map((r) => r.day))].filter((d) => rows.some((r) => r.day === d && r.arm === "control") && rows.some((r) => r.day === d && r.arm === "treatment"));
    const day = days.length ? Math.max(...days) : null;
    const base: MetricAnalysis = { metric: m, day, control: "–", treatment: "–", diff: null, ci: null, p: null, decision: "insufficient-data", claim: null };
    if (day === null) return base;
    const c = rows.filter((r) => r.day === day && r.arm === "control");
    const t = rows.filter((r) => r.day === day && r.arm === "treatment");
    const ctx = { commodity, control: design.control, treatment: design.treatment, days: day, conditions: design.conditions, n: "" };
    if (m.type === "continuous") {
      const w = welch(c.map((x) => x.value), t.map((x) => x.value));
      if (!w) return { ...base, control: `n=${c.length}`, treatment: `n=${t.length}` };
      const th = { metric: m.label, direction: m.direction, minimumDifference: m.minimumDifference, unit: m.unit };
      const decision = decide(w.ci, th);
      ctx.n = `n = ${w.nC} control, ${w.nT} treatment`;
      return { ...base, control: `${w.meanControl.toFixed(2)} ${m.unit} (n=${w.nC})`, treatment: `${w.meanTreatment.toFixed(2)} ${m.unit} (n=${w.nT})`, diff: w.diff, ci: w.ci, p: w.p, decision, claim: claimText(decision, th, w.ci, ctx) };
    }
    const xc = c.reduce((a, x) => a + x.value, 0), nc = c.reduce((a, x) => a + (x.n ?? 0), 0);
    const xt = t.reduce((a, x) => a + x.value, 0), nt = t.reduce((a, x) => a + (x.n ?? 0), 0);
    if (!nc || !nt) return base;
    const tp = twoProportions(xc, nc, xt, nt);
    const ci: [number, number] = [tp.ci[0] * 100, tp.ci[1] * 100];
    const th = { metric: m.label, direction: m.direction, minimumDifference: m.minimumDifference, unit: "percentage points" };
    const decision = decide(ci, th);
    ctx.n = `${nc} control and ${nt} treatment units`;
    return { ...base, control: `${(tp.pC * 100).toFixed(1)}% (${xc}/${nc})`, treatment: `${(tp.pT * 100).toFixed(1)}% (${xt}/${nt})`, diff: tp.diff * 100, ci, p: tp.p, decision, claim: claimText(decision, th, ci, ctx) };
  });
  const pairs = (design.predictions ?? []).map((p) => {
    const vals = obs.filter((o) => o.arm === "treatment" && o.metric === p.metric && o.day === p.day).map((o) => o.value);
    return vals.length ? { predicted: p.predicted, observed: vals.reduce((a, b) => a + b, 0) / vals.length, day: p.day, metric: p.metric } : null;
  }).filter(Boolean) as Array<{ predicted: number; observed: number; day: number; metric: string }>;
  const primary = metrics.find((m) => m.metric.key === design.primaryMetric) ?? null;
  return {
    metrics,
    primary,
    modelEvaluation: pairs.length ? { pairs, ...predictionError(pairs)! } : null,
    caveat: "Results apply to the trial conditions only. A single trial does not establish a universal shelf-life claim; the decision uses the pre-registered minimum difference and the 95% confidence interval."
  };
}

export function suggestSampleSize(m: TrialMetric, assumed: { sd?: number; pControl?: number }) {
  if (m.type === "continuous") return sampleSizeMeans(assumed.sd ?? 1, Math.max(m.minimumDifference, 1e-6));
  const p1 = assumed.pControl ?? 0.8;
  const p2 = Math.min(0.999, Math.max(0.001, p1 + (m.direction === "treatment-higher" ? 1 : -1) * m.minimumDifference / 100));
  return sampleSizeProportions(p1, p2);
}
