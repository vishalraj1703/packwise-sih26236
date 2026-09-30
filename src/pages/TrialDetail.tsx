import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { dateTimeStr, sig } from "../lib/format";
import { Card, ErrorBox, Notice, Spinner } from "../components/ui";

export default function TrialDetail() {
  const { id } = useParams();
  const [t, setT] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api(`/trials/${id}`).then(setT).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (err) return <Card><ErrorBox error={err} /></Card>;
  if (!t) return <Spinner />;
  const lock = async () => { if (confirm("Lock the plan? Thresholds cannot be changed afterwards.")) { await api(`/trials/${id}/lock`, { method: "POST" }); load(); } };
  const a = t.analysis;
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase text-ink-3">Trial & Verify</div>
        <h1 className="h1">{t.title}</h1>
        <p className="muted">{t.design.control} <strong>vs</strong> {t.design.treatment} · {t.design.conditions} · {t.design.durationDays} days · {t.design.unitsPerArm} packs per arm</p>
      </div>
      <Card title="Pre-registration" action={t.lockedAt ? <span className="chip bg-good-bg text-good">locked {dateTimeStr(t.lockedAt)}</span> : <button className="btn-primary btn-sm" onClick={lock}>Lock plan</button>}>
        <table className="table-clean">
          <thead><tr><th>Outcome</th><th>Better when</th><th>Minimum meaningful difference</th></tr></thead>
          <tbody>{t.design.metrics.map((m: any) => <tr key={m.key}><td>{m.label}{m.key === t.design.primaryMetric && <span className="chip ml-2 bg-accent-2">primary</span>}</td><td>{m.direction === "treatment-lower" ? "lower" : "higher"}</td><td>{m.minimumDifference} {m.unit === "pp" ? "percentage points" : m.unit}</td></tr>)}</tbody>
        </table>
        {t.lockHash && <p className="mt-2 text-xs">Fingerprint <code>#{t.lockHash}</code> — {t.integrity ? <span className="text-good">plan unchanged since locking ✓</span> : <span className="text-bad">plan differs from the locked fingerprint!</span>}</p>}
        {t.design.expertReviewer && <p className="text-xs text-ink-3">Thresholds reviewed by: {t.design.expertReviewer}</p>}
      </Card>
      {t.lockedAt && <AddObservations trial={t} onDone={load} />}
      {a && (
        <Card title="Analysis">
          <div className="space-y-3">
            {a.metrics.map((m: any) => (
              <div key={m.metric.key} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{m.metric.label}{m.day !== null && ` (day ${m.day})`}</strong>
                  <span className={`chip ${m.decision === "meets-threshold" ? "bg-good-bg text-good" : m.decision === "does-not-meet" ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn"}`}>{m.decision.replace(/-/g, " ")}</span>
                </div>
                <div className="mt-1 text-ink-2">Control {m.control} · Treatment {m.treatment}{m.ci && <> · difference {sig(m.diff)} (95% CI {sig(m.ci[0])} to {sig(m.ci[1])}) · p = {m.p < 0.001 ? "<0.001" : m.p.toFixed(3)}</>}</div>
                {m.claim && <p className="mt-2 rounded-lg bg-surface p-2 text-xs">{m.claim}</p>}
              </div>
            ))}
            {a.modelEvaluation && (
              <div className="rounded-xl bg-brand-3 p-3 text-sm">
                <div className="label">Model evaluation (prediction vs observed, treatment arm)</div>
                <table className="table-clean"><thead><tr><th>Outcome</th><th>Day</th><th>Predicted</th><th>Observed mean</th></tr></thead>
                  <tbody>{a.modelEvaluation.pairs.map((p: any, i: number) => <tr key={i}><td>{p.metric}</td><td>{p.day}</td><td>{sig(p.predicted)}</td><td>{sig(p.observed)}</td></tr>)}</tbody></table>
                <p className="mt-1">Bias {sig(a.modelEvaluation.bias)}, MAE {sig(a.modelEvaluation.mae)} (n = {a.modelEvaluation.n}). Reviewed outcomes feed later model evaluation.</p>
              </div>
            )}
            <Notice tone="info">{a.caveat}</Notice>
          </div>
        </Card>
      )}
    </div>
  );
}

function AddObservations({ trial, onDone }: { trial: any; onDone: () => void }) {
  const [metric, setMetric] = useState(trial.design.metrics[0].key);
  const [arm, setArm] = useState<"control" | "treatment">("control");
  const [day, setDay] = useState(trial.design.durationDays);
  const [values, setValues] = useState("");
  const [n, setN] = useState(trial.design.unitsPerArm);
  const [err, setErr] = useState<string | null>(null);
  const m = trial.design.metrics.find((x: any) => x.key === metric);
  const submit = async () => {
    setErr(null);
    try {
      const obs = m.type === "proportion"
        ? [{ arm, metric, day, value: +values, n }]
        : values.split(/[\s,;]+/).filter(Boolean).map((v: string) => ({ arm, metric, day, value: +v }));
      await api(`/trials/${trial.id}/observations`, { json: { observations: obs } });
      setValues(""); onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Card title={`Record results (${trial.observations.length} recorded)`}>
      <div className="grid gap-2 sm:grid-cols-5">
        <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>{trial.design.metrics.map((x: any) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        <select className="input" value={arm} onChange={(e) => setArm(e.target.value as any)}><option value="control">control</option><option value="treatment">treatment</option></select>
        <input className="input" type="number" value={day} onChange={(e) => setDay(+e.target.value)} aria-label="Day" />
        {m.type === "proportion"
          ? <><input className="input" type="number" placeholder="packs meeting outcome" value={values} onChange={(e) => setValues(e.target.value)} /><input className="input" type="number" placeholder="of n packs" value={n} onChange={(e) => setN(+e.target.value)} /></>
          : <input className="input sm:col-span-2" placeholder="values, e.g. 4.2, 4.4, 4.1" value={values} onChange={(e) => setValues(e.target.value)} />}
      </div>
      <button className="btn-primary btn-sm mt-2" disabled={!values} onClick={submit}>Add</button>
      <ErrorBox error={err} />
    </Card>
  );
}
