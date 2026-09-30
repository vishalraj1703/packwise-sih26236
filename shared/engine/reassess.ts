// Reassessment before dispatch: re-run the engine with changed conditions and
// report which selected options remain supported (discussion record p.5).
import type { Recommendation, Candidate, OrderPlan } from "./recommend";

export interface ReassessChange {
  portionId: string;
  label: string;
  before: { support: Candidate["support"]; margin: number; summary: string } | null;
  after: { support: Candidate["support"]; margin: number; summary: string } | null;
  verdict: "still-supported" | "now-conditional" | "no-longer-supported" | "improved" | "unchanged";
}

const summary = (c: Candidate) =>
  c.moisture ? `moisture limit after ≈${Math.round(c.moisture.daysP10)}–${Math.round(c.moisture.daysP50)} d (target ${Math.round(c.moisture.targetDays)} d)`
  : c.map ? `O₂ ${(c.map.equilibriumAtStorage.o2 * 100).toFixed(1)}%, in-window ${Math.round(c.map.probability.inWindow * 100)}%`
  : c.fresh ? `${Math.round(c.fresh.consumedFraction * 100)}% of storage life used`
  : c.support;

/** Compare the candidates of a selected plan across two runs (matched by structure/size/control and transport). */
export function compareSelected(before: Recommendation, after: Recommendation, planId: string): ReassessChange[] {
  const plan = before.plans.find((p) => p.id === planId) ?? before.plans[0];
  if (!plan) return [];
  return plan.selections.map((sel) => {
    const pb = before.portions.find((p) => p.portion.id === sel.portionId);
    const cb = pb?.candidates.find((c) => c.key === sel.candidateKey) ?? null;
    const pa = after.portions.find((p) => p.portion.id === sel.portionId);
    const ca = pa?.candidates.find((c) => c.key === sel.candidateKey) ?? null;
    const rank = { supported: 2, conditional: 1, "not-supported": 0 } as const;
    let verdict: ReassessChange["verdict"] = "unchanged";
    if (cb && !ca) verdict = "no-longer-supported";
    else if (cb && ca) {
      const d = rank[ca.support] - rank[cb.support];
      verdict = d < 0 ? (ca.support === "not-supported" ? "no-longer-supported" : "now-conditional") : d > 0 ? "improved" : ca.support === "supported" ? "still-supported" : "unchanged";
    }
    return {
      portionId: sel.portionId,
      label: pb?.portion.label ?? sel.portionId,
      before: cb ? { support: cb.support, margin: cb.margin, summary: summary(cb) } : null,
      after: ca ? { support: ca.support, margin: ca.margin, summary: summary(ca) } : null,
      verdict
    };
  });
}

/** Remove bulky traces from options that are not supported to keep stored records small. */
export function compact(rec: Recommendation): Recommendation {
  return {
    ...rec,
    portions: rec.portions.map((p) => ({
      ...p,
      candidates: p.candidates.map((c) => c.support === "not-supported"
        ? { ...c, moisture: c.moisture ? { ...c.moisture, trace: [] } : undefined, map: c.map ? { ...c.map, transient: [] } : undefined, explanation: "" }
        : c)
    }))
  };
}

export function planById(rec: Recommendation, id: string | null | undefined): OrderPlan | undefined {
  return rec.plans.find((p) => p.id === id);
}
