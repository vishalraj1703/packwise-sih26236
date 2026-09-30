import { useEffect, useState } from "react";
import type { AssessmentInput, Candidate, OrderPlan, Recommendation } from "../../shared/engine/recommend";
import { api } from "./api";

export interface SavedAssessment { id: number; title: string; input: AssessmentInput; result: Recommendation; selectedPlanId: string | null }

export function useAssessment(id: string | undefined) {
  const [a, setA] = useState<SavedAssessment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (id) api<SavedAssessment>(`/assessments/${id}`).then(setA).catch((e) => setErr(e.message)); }, [id]);
  const plan: OrderPlan | undefined = a ? a.result.plans.find((p) => p.id === a.selectedPlanId) ?? a.result.plans[0] : undefined;
  const selections: Array<{ c: Candidate; label: string }> = a && plan
    ? plan.selections.map((s) => ({ c: a.result.portions.flatMap((p) => p.candidates).find((c) => c.key === s.candidateKey)!, label: a.input.portions.find((p) => p.id === s.portionId)!.label }))
    : [];
  return { a, err, plan, selections };
}
