import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Candidate, OrderPlan, PortionResult, Recommendation, AssessmentInput } from "../../shared/engine/recommend";
import { tagLabel } from "../../shared/engine/recommend";
import type { ReassessChange } from "../../shared/engine/reassess";
import { getCommodity } from "../../shared/data/commodities";
import { EQUIPMENT } from "../../shared/engine/sealing";
import { api, local } from "../lib/api";
import { useAuth } from "../lib/auth";
import { foodImage } from "../lib/images";
import { useI18n } from "../lib/i18n";
import { days, inr, inr2, kg, pct, sig, dateStr } from "../lib/format";
import { Card, Disclosure, ErrorBox, Notice, SourceRef, Spinner, Stat, StatusBadge, SupportBadge, Tabs } from "../components/ui";
import LineChart from "../components/LineChart";
import { PackIllustration } from "../components/Illustrations";
import RealLifeExamples, { LooksLike } from "../components/RealLifeExamples";
import { plainName } from "../../shared/data/materials";

interface Loaded { id: number | "local"; title: string; input: AssessmentInput; result: Recommendation; selectedPlanId?: string | null; parentId?: number | null }

export default function Results() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setData(null); setErr(null);
    if (id === "local") {
      const l = local.get<any>("packwise-local-result", null);
      if (!l) setErr("No result on this device. Run an assessment first.");
      else setData({ id: "local", title: `${l.result.commodity.name} (computed on this device)`, input: l.input, result: l.result });
    } else {
      api<Loaded>(`/assessments/${id}`).then(setData).catch((e) => setErr(e.message));
    }
  }, [id, user]);
  if (err) return <Card><ErrorBox error={err} />{!user && <p className="mt-2 text-sm"><Link className="underline" to={`/login?next=/results/${id}`}>Sign in</Link> to view saved assessments.</p>}</Card>;
  if (!data) return <Spinner label="Loading options…" />;
  return <ResultsView data={data} setData={setData} />;
}

const OXY: Record<string, string> = { "gas-flush": "nitrogen flushing", vacuum: "vacuum", absorber: "oxygen-absorber sachet", none: "" };
const candOf = (r: Recommendation, key: string) => r.portions.flatMap((p) => p.candidates).find((c) => c.key === key)!;

function ResultsView({ data, setData }: { data: Loaded; setData: (d: Loaded) => void }) {
  const r = data.result;
  const { user } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();
  const c = getCommodity(r.commodity.id);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [portionTab, setPortionTab] = useState(r.portions[0]?.portion.id ?? "");
  const j = r.input.journey;

  const choose = async (plan: OrderPlan) => {
    setErr(null);
    if (data.id === "local") {
      if (!user) { nav(`/login?next=/assess`); return; }
      setSaving(true);
      try {
        const s = await api<{ id: number }>("/assessments", { json: { input: data.input } });
        const saved = await api<Loaded>(`/assessments/${s.id}`);
        const match = saved.result.plans.find((p) => p.tags.join() === plan.tags.join()) ?? saved.result.plans[0];
        await api(`/assessments/${s.id}/select`, { json: { planId: match.id } });
        nav(`/source/${s.id}`);
      } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
      return;
    }
    setSaving(true);
    try {
      await api(`/assessments/${data.id}/select`, { json: { planId: plan.id } });
      setData({ ...data, selectedPlanId: plan.id });
      nav(`/source/${data.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Packaging-and-journey options</div>
          <h1 className="h1 flex items-center gap-3">{foodImage(c.id) && <img src={foodImage(c.id)!} alt="" className="h-12 w-12 rounded-xl object-cover" />}{r.commodity.name} · {j.origin.name.split(",")[0]} → {j.destination.name.split(",")[0]}</h1>
          <p className="muted">{r.input.portions.reduce((a, p) => a + p.kg, 0)} kg in {r.input.portions.length} portion(s) · departure {dateStr(j.departureDate)} · {j.distanceKm} km · {r.engineVersion} · {dateStr(r.createdAt)}</p>
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => window.print()}>Print / PDF</button>
          <Link to="/assess" className="btn-ghost btn-sm">Edit inputs</Link>
        </div>
      </header>

      {r.warnings.length > 0 && <div className="space-y-2">{r.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}</div>}

      {r.plans.length === 0 ? (
        <Card><Notice tone="bad">No feasible plan was found for the whole order. See each portion below for the reasons and the measurements that would change the decision.</Notice></Card>
      ) : (
        <section>
          <h2 className="h2 mb-3">Choose among feasible plans</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {r.plans.map((p) => (
              <PlanCard key={p.id} plan={p} r={r} selected={data.selectedPlanId === p.id} open={openPlan === p.id} onToggle={() => setOpenPlan(openPlan === p.id ? null : p.id)} onChoose={() => choose(p)} busy={saving} />
            ))}
          </div>
          <ErrorBox error={err} />
        </section>
      )}

      {r.orderComparison.length > 1 && (
        <Card title="Order-level comparison">
          <p className="muted mb-3">Minimum orders and setup charges can outweigh a cheaper film price. Same transport, same other portions:</p>
          <table className="table-clean">
            <thead><tr><th>Approach</th><th>Packs</th><th className="text-right">Total</th><th className="text-right">per kg</th></tr></thead>
            <tbody>{r.orderComparison.map((o) => <tr key={o.label}><td className="font-semibold">{o.label}</td><td className="text-ink-2">{o.note}</td><td className="text-right">{inr(o.totalInr)}</td><td className="text-right">{inr2(o.perKgInr)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Technical detail by portion</h2>
          <Tabs tabs={r.portions.map((p) => ({ id: p.portion.id, label: <span>{p.portion.label} {p.insufficient && <span className="text-bad">•</span>}</span> }))} value={portionTab} onChange={setPortionTab} />
        </div>
        {r.portions.filter((p) => p.portion.id === portionTab).map((p) => <PortionDetail key={p.portion.id} p={p} r={r} />)}
      </section>

      {data.id !== "local" && <ReassessPanel data={data} />}

      <Card>
        <p className="text-sm text-ink-2"><strong>{r.promise}</strong> Desired shelf life is a target, not an automatically achievable prediction. Figures depend on the stated inputs and assumptions; <Link className="underline" to="/trials">verify with a small trial</Link> before making claims.</p>
      </Card>
    </div>
  );
}

function PlanCard({ plan, r, selected, open, onToggle, onChoose, busy }: { plan: OrderPlan; r: Recommendation; selected: boolean; open: boolean; onToggle: () => void; onChoose: () => void; busy: boolean }) {
  const { t } = useI18n();
  const cands = plan.selections.map((s) => candOf(r, s.candidateKey));
  const worst = cands.some((c) => c.support === "conditional") ? "conditional" : "supported";
  return (
    <article className={`card flex flex-col p-5 ${selected ? "ring-2 ring-brand" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1">{plan.tags.map((tg) => <span key={tg} className="chip bg-accent-2 text-ink">{tagLabel(tg)}</span>)}</div>
        <SupportBadge support={worst} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("cost")} value={inr(plan.cost.totalInr)} sub={`${inr2(plan.cost.perKgInr)} ${t("perkg")}`} />
        <Stat label="Door to door" value={`${Math.round(plan.deliveryHours)} h`} sub={plan.transport.mode.replace("-", " ")} />
        <Stat label="Protection margin" value={`×${Math.min(plan.minMargin, 99).toFixed(1)}`} sub={plan.minDelayMargin !== null ? `×${Math.min(plan.minDelayMargin, 99).toFixed(1)} if delayed` : undefined} />
      </div>
      <p className="mt-3 text-sm text-ink-2">{plan.whatItCommunicates}</p>
      {plan.overBudget && <Notice tone="warn">Above your budget of {inr(r.input.budgetInrPerKg!)}/kg.</Notice>}
      <ul className="mt-3 space-y-2">
        {cands.map((c) => {
          const portion = r.input.portions.find((p) => p.id === c.portionId)!;
          return (
            <li key={c.key} className="flex items-center gap-3 rounded-xl bg-surface p-2">
              <PackIllustration format={c.format} className="h-12 w-12 shrink-0" />
              <div className="min-w-0 text-sm">
                <div className="font-semibold">{portion.label}</div>
                <div className="text-ink">{c.units} × {kg(c.packSizeKg)} — {plainName(c.structureId)}{c.oxygenControl !== "none" ? ` + ${OXY[c.oxygenControl]}` : ""}</div>
                <LooksLike structureId={c.structureId} />
                <div className="text-xs text-ink-3">{c.structureName} · {c.sealMethod ? EQUIPMENT[c.sealMethod].label : ""}{c.viaService ? " (packing service)" : ""} · {c.supplierName}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 text-xs text-ink-3">Transport: {plan.transport.label} — {plan.transport.note} <span className="chip bg-surface">simulated rate</span></div>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={onToggle} aria-expanded={open}>{t("why")}</button>
        <button className="btn-primary" disabled={busy} onClick={onChoose}>{selected ? "Selected — continue →" : t("choose")}</button>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {cands.map((c) => <WhyPanel key={c.key} c={c} r={r} />)}
          <CostBreakdown plan={plan} />
        </div>
      )}
    </article>
  );
}

function WhyPanel({ c, r }: { c: Candidate; r: Recommendation }) {
  const com = getCommodity(r.commodity.id);
  const portion = r.input.portions.find((p) => p.id === c.portionId)!;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><h3 className="font-bold">{portion.label}: {plainName(c.structureId)}</h3><SupportBadge support={c.support} /></div>
      <RealLifeExamples structureId={c.structureId} commodityId={r.commodity.id} />
      <p className="text-sm">{c.explanation}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {c.moisture && !Number.isNaN(c.moisture.providedWvtr) && (
          <div className="rounded-xl border border-line p-2 text-sm"><div className="label">Required vs documented — WVTR</div>
            Required ≤ <strong>{c.moisture.requiredWvtrP50 >= 1e5 ? "any" : sig(c.moisture.requiredWvtrP50)}</strong> (cautious {sig(c.moisture.requiredWvtrStrict)}) · this pack <strong>{sig(c.moisture.providedWvtr)}</strong> g/m²·day
            <div className="text-xs text-ink-3">Pack value from {c.moisture.providedBasis}</div></div>
        )}
        {c.oxygen && !Number.isNaN(c.oxygen.providedOtr) && (
          <div className="rounded-xl border border-line p-2 text-sm"><div className="label">Required vs documented — OTR</div>
            Full-budget requirement ≤ <strong>{sig(c.oxygen.requiredOtr)}</strong> · this pack <strong>{sig(c.oxygen.providedOtr)}</strong> cc/m²·day{c.oxygen.note && <div className="text-xs text-ink-3">{c.oxygen.note}</div>}</div>
        )}
      </div>
      <table className="table-clean">
        <thead><tr><th>Evidence</th><th>Value</th><th>Status</th><th>Source</th></tr></thead>
        <tbody>{c.evidence.map((e) => <tr key={e.label}><td>{e.label}{e.note && <div className="text-xs text-ink-3">{e.note}</div>}</td><td>{e.value}</td><td><StatusBadge status={e.status} /></td><td><SourceRef id={e.sourceId} /></td></tr>)}</tbody>
      </table>
      {c.conditions.length > 0 && <div><div className="label">Applies only if</div><ul className="list-disc pl-5 text-sm">{c.conditions.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {c.stillToCheck.length > 0 && <div><div className="label">Still needs checking</div><ul className="list-disc pl-5 text-sm text-warn">{c.stillToCheck.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {com.commercialExample && (
        <div className="flex gap-3 rounded-xl bg-surface p-3">
          <PackIllustration format={com.commercialExample.illustration} className="h-16 w-16 shrink-0" />
          <div className="text-sm"><div className="font-semibold">Why your food is similar — {com.commercialExample.format}</div><p className="text-ink-2">{com.commercialExample.explanation}</p></div>
        </div>
      )}
    </div>
  );
}

function CostBreakdown({ plan }: { plan: OrderPlan }) {
  return (
    <div>
      <div className="label">Total order cost</div>
      <table className="table-clean">
        <tbody>
          {plan.cost.lines.map((l, i) => (
            <tr key={i}><td>{l.label}<div className="text-xs text-ink-3">{l.detail}</div></td><td><span className={`chip ${l.basis === "simulated-quote" ? "bg-info-bg text-info" : "bg-accent-2 text-warn"}`}>{l.basis === "simulated-quote" ? "quote (simulated)" : "estimate"}</span></td><td className="text-right">{inr2(l.amountInr)}</td></tr>
          ))}
          <tr><td className="font-bold">Total</td><td /><td className="text-right font-bold">{inr2(plan.cost.totalInr)}</td></tr>
          <tr><td className="text-ink-2">Per kg of food packed</td><td /><td className="text-right">{inr2(plan.cost.perKgInr)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function PortionDetail({ p, r }: { p: PortionResult; r: Recommendation }) {
  const [filter, setFilter] = useState<"feasible" | "all">("feasible");
  const [transport, setTransport] = useState<string>(Object.keys(p.profiles)[0] ?? "");
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => p.candidates.filter((c) => c.transportId === transport && (filter === "all" || c.support !== "not-supported")).sort((a, b) => (a.support === b.support ? a.standaloneInr - b.standaloneInr : a.support === "supported" ? -1 : b.support === "supported" ? 1 : a.support === "conditional" ? -1 : 1)), [p, filter, transport]);
  const selected = p.candidates.find((c) => c.key === sel) ?? list[0];
  if (p.insufficient) {
    return (
      <Card>
        <Notice tone="bad"><strong>Insufficient evidence.</strong> {p.insufficient.reason}</Notice>
        <h3 className="mt-4 font-bold">What is needed before a recommendation can be supported</h3>
        <ul className="mt-2 space-y-2">{p.insufficient.measurements.map((m) => <li key={m.label} className="rounded-xl border border-line p-3 text-sm"><div className="font-semibold">{m.label}</div><div className="text-ink-2">{m.why}</div><div className="text-xs text-ink-3">How: {m.howToMeasure}</div></li>)}</ul>
        <ChecksNeeds p={p} />
      </Card>
    );
  }
  const prof = p.profiles[transport] ?? [];
  return (
    <div className="space-y-4">
      <ChecksNeeds p={p} />
      <Card title="Exposure profile used">
        <table className="table-clean">
          <thead><tr><th>Segment</th><th>Days</th><th>Temp °C</th><th>RH %</th><th>Status</th></tr></thead>
          <tbody>{prof.map((s) => <tr key={s.label}><td>{s.label}</td><td>{s.days.toFixed(1)}</td><td>{s.tC}</td><td>{s.rhPct}</td><td><StatusBadge status={s.status} /></td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Options evaluated" action={
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto py-1.5" value={transport} onChange={(e) => { setTransport(e.target.value); setSel(null); }}>
            {r.transportOptions.filter((t) => p.profiles[t.id]).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <Tabs tabs={[{ id: "feasible", label: "Feasible" }, { id: "all", label: "All" }]} value={filter} onChange={setFilter} />
        </div>
      }>
        {list.length === 0 ? <Notice tone="bad">No option is supported with this transport. Switch to “All” to see why each was rejected.</Notice> : (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead><tr><th>Pack</th><th>O₂ control</th><th>Protection</th><th>Supplier</th><th className="text-right">Standalone cost</th><th>Status</th></tr></thead>
              <tbody>
                {list.slice(0, 40).map((c) => (
                  <tr key={c.key} className={`cursor-pointer ${selected?.key === c.key ? "bg-brand-3" : "hover:bg-surface"}`} onClick={() => setSel(c.key)}>
                    <td><div className="font-semibold">{plainName(c.structureId)}</div><div className="text-xs text-ink-3">{c.structureName} · {c.units} × {kg(c.packSizeKg)}</div></td>
                    <td>{c.oxygenControl}</td>
                    <td className="text-xs">{c.moisture ? `moisture: ${days(c.moisture.daysP10)} (cautious)` : ""}{c.map ? `O₂ ${pct(c.map.equilibriumAtStorage.o2)} · ${Math.round(c.map.probability.inWindow * 100)}% in window` : ""}{c.fresh && !c.map ? `${Math.round(c.fresh.consumedFraction * 100)}% life used` : ""}{c.reasons[0] && <div className="text-bad">{c.reasons[0]}</div>}</td>
                    <td className="text-xs">{c.supplierName ?? "–"}{c.documentation && <div className="text-ink-3">{c.documentation.replace(/-/g, " ")}</div>}</td>
                    <td className="text-right">{Number.isFinite(c.standaloneInr) ? inr(c.standaloneInr) : "–"}</td>
                    <td><SupportBadge support={c.support} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {selected && <CandidateDetail c={selected} p={p} r={r} />}
      <Disclosure summary={`Excluded before evaluation (${p.excluded.length})`}>
        <ul className="space-y-1 text-sm">{p.excluded.map((e, i) => <li key={i}><strong>{e.structure}</strong> — {e.reason}</li>)}</ul>
      </Disclosure>
    </div>
  );
}

function ChecksNeeds({ p }: { p: PortionResult }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Inputs and their status">
        <ul className="space-y-2">
          {p.checks.map((c) => (
            <li key={c.key} className={`rounded-xl border p-2 text-sm ${c.severity === "block" ? "border-bad/40 bg-bad-bg" : c.severity === "warn" ? "border-warn/30 bg-warn-bg/50" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.label}{c.display ? `: ${c.display}` : ""}</span><span className="flex gap-1"><StatusBadge status={c.status} /><SourceRef id={c.sourceId} /></span></div>
              <div className="text-xs text-ink-2">{c.message}</div>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card title="Protection needs">
          <ul className="space-y-1.5 text-sm">{p.needs.map((n, i) => <li key={i} className="flex gap-2"><span className={`chip shrink-0 ${n.level === "high" ? "bg-bad-bg text-bad" : n.level === "medium" ? "bg-warn-bg text-warn" : "bg-surface text-ink-2"}`}>{n.kind}</span><span>{n.text}</span></li>)}</ul>
        </Card>
        {p.requirements.length > 0 && (
          <Card title="Technical requirements (at standard test conditions)">
            <ul className="space-y-2 text-sm">{p.requirements.map((q) => <li key={q.label}><div className="font-semibold">{q.label}: <span className="text-brand">{q.value}</span></div><div className="text-xs text-ink-3">{q.basis}</div></li>)}</ul>
            {p.gaugeHints.length > 0 && (
              <div className="mt-3 text-sm"><div className="label">Single-material minimum thickness</div>
                <div className="flex flex-wrap gap-2">{p.gaugeHints.map((g) => <span key={g.material} className="chip bg-surface text-ink-2">{g.material}: {g.gaugeUm ? `${g.gaugeUm} µm` : `>${Math.round(g.exactUm)} µm (impractical)`}</span>)}</div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function CandidateDetail({ c, p, r }: { c: Candidate; p: PortionResult; r: Recommendation }) {
  const com = getCommodity(r.commodity.id);
  return (
    <Card title={<span className="flex items-center gap-3"><PackIllustration format={c.format} opaque={c.layersText.includes("Metal") || c.layersText.includes("foil")} className="h-12 w-12" /><span>{plainName(c.structureId)}<span className="block text-xs font-normal text-ink-3">{c.structureName}</span></span></span>} action={<SupportBadge support={c.support} large />}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <p>{c.explanation || c.reasons.join(" ")}</p>
          <RealLifeExamples structureId={c.structureId} commodityId={r.commodity.id} />
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Layers" value={<span className="text-sm">{c.layersText}</span>} />
            <Stat label="Pack" value={`${c.units} × ${kg(c.packSizeKg)}`} sub={`≈${c.geometry.flatWidthCm.toFixed(0)} × ${c.geometry.flatLengthCm.toFixed(0)} cm flat`} />
            <Stat label="Material per kg food" value={`${c.sustainability.filmGPerKgFood.toFixed(1)} g`} sub={`${c.sustainability.co2eKgPerKgFood[0].toFixed(3)}–${c.sustainability.co2eKgPerKgFood[1].toFixed(3)} kg CO₂e/kg (indicative)`} />
            <Stat label="End of life" value={<span className="text-sm">{c.sustainability.recyclability.label}</span>} sub={c.sustainability.recyclability.pwmCategory} />
          </div>
          {c.reasons.length > 0 && <Notice tone="bad">{c.reasons.join(" ")}</Notice>}
          {c.seal && (
            <Disclosure summary="Sealing specification & acceptance tests (Gap 4)" defaultOpen>
              <p className="mb-2">{EQUIPMENT[c.seal.method].label}{c.seal.sealTempC ? ` · sealant range ${c.seal.sealTempC[0]}–${c.seal.sealTempC[1]} °C` : ""} · seal width ≥ {c.seal.sealWidthMm} mm {c.viaService && <span className="chip bg-info-bg text-info">packing service</span>}</p>
              <table className="table-clean"><thead><tr><th>Test</th><th>Standard</th><th>Acceptance (proposed)</th></tr></thead>
                <tbody>{c.seal.seals.map((s) => <tr key={s.test}><td>{s.test}</td><td><SourceRef id={s.sourceId} /> {s.standard}</td><td>{s.acceptance}</td></tr>)}</tbody></table>
              <p className="mt-2">Sampling: check <strong>{c.seal.sampling.sampleSize}</strong> of {c.seal.sampling.lotSize} packs — {c.seal.sampling.rule} (95% confidence that ≤ 5% are defective).</p>
              {c.seal.punctureNote && <p className="mt-1 text-warn">{c.seal.punctureNote}</p>}
              <p className="mt-1 text-xs text-ink-3">Numerical acceptance limits are proposed defaults awaiting expert confirmation.</p>
            </Disclosure>
          )}
          {c.cartons && (
            <Disclosure summary="Outer carton & stacking (McKee)">
              <p>{c.cartons.cartons} cartons × {c.cartons.unitsPerCarton} packs, ≈{c.cartons.dimsCm.map((x) => x.toFixed(0)).join(" × ")} cm, {c.cartons.cartonGrossKg.toFixed(1)} kg gross.</p>
              <p>Stack {c.cartons.stackLayers} high (1.5 m): required BCT {Math.round(c.cartons.requiredBctN)} N incl. safety factor ×{c.cartons.factors.safetyFactor.toFixed(1)} (time {c.cartons.factors.time}, humidity {c.cartons.factors.hum}, pattern {c.cartons.factors.pattern}, handling {c.cartons.factors.handling}).</p>
              <p>{c.cartons.grade ? <>Board: <strong>{c.cartons.grade.name}</strong> — estimated BCT {Math.round(c.cartons.bctN)} N.</> : <span className="text-bad">{c.cartons.note}</span>} Drop test height (ISTA 1A class): {c.cartons.dropHeightCm} cm.</p>
            </Disclosure>
          )}
          {c.crate && <p>Outer: {c.crate.crates} × {c.crate.name}.</p>}
        </div>
        <div className="space-y-4">
          {c.moisture && c.moisture.trace.length > 1 && (
            <LineChart title="Predicted moisture (central inputs)" xLabel="Day" yLabel="Moisture % w.b." yFormat={(y) => y.toFixed(2)}
              series={[{ id: "m", label: "Moisture", color: "#2a78d6", points: c.moisture.trace.map((t) => ({ x: t.day, y: t.moistureWb })) }]}
              refLines={[{ y: c.moisture.criticalWb, label: `limit ${c.moisture.criticalWb}%` }]} />
          )}
          {c.map && c.map.transient.length > 1 && (
            <>
              <LineChart title="In-pack atmosphere after sealing" xLabel="Day" yLabel="Gas %" yFormat={(y) => y.toFixed(1)} yMin={0}
                series={[{ id: "o2", label: "O₂", color: "#2a78d6", points: c.map.transient.map((t) => ({ x: t.day, y: t.o2 * 100 })) }, { id: "co2", label: "CO₂", color: "#eb6834", points: c.map.transient.map((t) => ({ x: t.day, y: t.co2 * 100 })) }]}
                band={com.respiration ? { y0: com.respiration.targetO2[0] * 100, y1: com.respiration.targetO2[1] * 100, label: "O₂ target window" } : undefined}
                refLines={com.respiration ? [{ y: com.respiration.minO2 * 100, label: "anaerobic below" }] : []} />
              <table className="table-clean text-xs"><thead><tr><th>Segment</th><th>°C</th><th>O₂</th><th>CO₂</th><th /></tr></thead>
                <tbody>{c.map.bySegment.map((s) => <tr key={s.label}><td>{s.label}</td><td>{s.tC}</td><td>{pct(s.o2)}</td><td>{pct(s.co2)}</td><td>{s.anaerobic ? <span className="text-bad">anaerobic risk</span> : s.inWindow ? <span className="text-good">in window</span> : "outside window"}</td></tr>)}</tbody></table>
              <p className="text-xs text-ink-2">Monte Carlo ({c.map.probability.samples} runs): in window {Math.round(c.map.probability.inWindow * 100)}%, anaerobic {Math.round(c.map.probability.anaerobic * 100)}%, CO₂ injury {Math.round(c.map.probability.co2Injury * 100)}%. Perforations {c.map.holes} × {c.map.holeDiameterUm ?? "–"} µm (range {c.map.holesRange[0]}–{c.map.holesRange[1]}).</p>
            </>
          )}
          {c.oxygen && (
            <div className="rounded-xl bg-surface p-3 text-sm">
              <div className="label">Oxygen budget (Gap 1)</div>
              Headspace O₂ {sig(c.oxygen.headspaceMg)} mg + ingress {sig(c.oxygen.ingressMg)} mg vs tolerance {sig(c.oxygen.budgetMg)} mg (strict {sig(c.oxygen.budgetStrictMg)} mg) per pack.
              {c.oxygen.absorberCc && <div>Absorber: {c.oxygen.absorberCc} cc per pack.</div>}
            </div>
          )}
          {c.fresh && <div className="rounded-xl bg-surface p-3 text-sm"><div className="label">Temperature & storage life</div>{Math.round(c.fresh.consumedFraction * 100)}% of reference storage life used (range {Math.round(c.fresh.consumedRange[0] * 100)}–{Math.round(c.fresh.consumedRange[1] * 100)}%). {c.fresh.note}</div>}
        </div>
      </div>
    </Card>
  );
}

function ReassessPanel({ data }: { data: Loaded }) {
  const [delayH, setDelayH] = useState(0);
  const [newDate, setNewDate] = useState(data.input.journey.departureDate);
  const [tC, setTC] = useState<string>("");
  const [rh, setRh] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ id: number; comparison: ReassessChange[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const j = { ...data.input.journey, departureDate: newDate, driveHours: data.input.journey.driveHours + delayH };
      const portions = data.input.portions.map((p) => ({ ...p, storage: { ...p.storage, ...(tC !== "" ? { tC: +tC } : {}), ...(rh !== "" ? { rhPct: +rh } : {}), status: (tC !== "" || rh !== "") ? "user" as const : p.storage.status } }));
      const out = await api<{ id: number; comparison: ReassessChange[] }>(`/assessments/${data.id}/reassess`, { json: { input: { journey: j, portions }, note: [delayH ? `+${delayH} h transit` : "", tC ? `${tC} °C` : "", rh ? `${rh}% RH` : ""].filter(Boolean).join(", ") } });
      setRes(out);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const tone = (v: ReassessChange["verdict"]) => (v === "no-longer-supported" ? "bad" : v === "now-conditional" ? "warn" : "good");
  return (
    <Card title="Reassess before dispatch">
      <p className="muted mb-3">If conditions change — a delay, a heatwave, a different store room — re-run the selected plan. Live monitoring would need sensors; a route map or QR code cannot provide it.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block"><span className="label">New departure date</span><input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
        <label className="block"><span className="label">Extra transit hours</span><input className="input" type="number" min={0} value={delayH} onChange={(e) => setDelayH(+e.target.value)} /></label>
        <label className="block"><span className="label">Storage temp °C</span><input className="input" type="number" value={tC} onChange={(e) => setTC(e.target.value)} placeholder="unchanged" /></label>
        <label className="block"><span className="label">Storage RH %</span><input className="input" type="number" value={rh} onChange={(e) => setRh(e.target.value)} placeholder="unchanged" /></label>
      </div>
      <button className="btn-primary mt-3" disabled={busy} onClick={run}>{busy ? "Reassessing…" : "Reassess selected plan"}</button>
      <ErrorBox error={err} />
      {res && (
        <div className="mt-4 space-y-2">
          {res.comparison.map((x) => (
            <Notice key={x.portionId} tone={tone(x.verdict)}>
              <strong>{x.label}: {x.verdict.replace(/-/g, " ")}</strong> — before: {x.before?.summary ?? "–"}; after: {x.after?.summary ?? "option no longer evaluated"}
            </Notice>
          ))}
          <Link to={`/results/${res.id}`} className="text-sm font-semibold text-brand underline">Open the reassessed options →</Link>
        </div>
      )}
    </Card>
  );
}
