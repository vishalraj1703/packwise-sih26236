import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { COMMODITIES } from "../../shared/data/commodities";
import { suggestSampleSize, type TrialMetric } from "../../shared/engine/trial";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateStr } from "../lib/format";
import { Card, Empty, ErrorBox, Field, Notice, Spinner } from "../components/ui";

const DEFAULT_METRICS: TrialMetric[] = [
  { key: "moisture", label: "Moisture", unit: "% w.b.", type: "continuous", direction: "treatment-lower", minimumDifference: 0.3 },
  { key: "saleable", label: "Saleable packs", unit: "pp", type: "proportion", direction: "treatment-higher", minimumDifference: 5 },
  { key: "damage", label: "Damaged packs", unit: "pp", type: "proportion", direction: "treatment-lower", minimumDifference: 3 }
];

export default function Trials() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (user) api<any[]>("/trials").then(setRows).catch((e) => setErr(e.message)); }, [user]);
  if (loading) return <Spinner />;
  if (!user) return <Card><p>Please <Link className="underline" to="/login?next=/trials">sign in</Link>.</p></Card>;
  return (
    <div className="space-y-5">
      <h1 className="h1">Trial & Verify</h1>
      <p className="muted max-w-3xl">Compare current and recommended packaging on small batches under the same conditions. Decide the pass thresholds with an expert <em>before</em> the trial and lock them — PackWise fingerprints the plan so it cannot be changed after results are seen. A single trial supports claims only for its conditions.</p>
      <ErrorBox error={err} />
      <Card title="Your trials">
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No trials yet.</Empty> : (
          <table className="table-clean"><thead><tr><th>Trial</th><th>Status</th><th>Locked</th><th>Observations</th></tr></thead>
            <tbody>{rows.map((t) => <tr key={t.id}><td><Link className="font-semibold text-brand hover:underline" to={`/trials/${t.id}`}>{t.title}</Link><div className="text-xs text-ink-3">{t.design.control} vs {t.design.treatment}</div></td><td><span className="chip bg-surface">{t.status}</span></td><td>{t.lockedAt ? <span className="font-mono text-xs">{dateStr(t.lockedAt)} · #{t.lockHash}</span> : "draft"}</td><td>{t.observations}</td></tr>)}</tbody></table>
        )}
      </Card>
      {user.role !== "transporter" && user.role !== "retailer" && <NewTrial />}
    </div>
  );
}

function NewTrial() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [commodityId, setC] = useState("cashew-kernel");
  const [control, setControl] = useState("Current packaging");
  const [treatment, setTreatment] = useState("Recommended packaging");
  const [conditions, setConditions] = useState("ordinary room, logged temperature and humidity");
  const [duration, setDuration] = useState(60);
  const [units, setUnits] = useState(50);
  const [metrics, setMetrics] = useState<TrialMetric[]>(DEFAULT_METRICS.slice(0, 2));
  const [primary, setPrimary] = useState("saleable");
  const [sd, setSd] = useState(0.3);
  const [pc, setPc] = useState(0.8);
  const [err, setErr] = useState<string | null>(null);
  const pm = metrics.find((m) => m.key === primary);
  const n = pm ? suggestSampleSize(pm, { sd, pControl: pc }) : null;
  const setM = (i: number, p: Partial<TrialMetric>) => setMetrics(metrics.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const submit = async () => {
    setErr(null);
    try {
      const r = await api<{ id: number }>("/trials", { json: { title, design: { commodityId, control, treatment, conditions, durationDays: duration, checkpointsDays: [0, Math.round(duration / 2), duration], unitsPerArm: units, primaryMetric: primary, metrics } } });
      nav(`/trials/${r.id}`);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Card title="Design a new trial">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Food"><select className="input" value={commodityId} onChange={(e) => setC(e.target.value)}>{COMMODITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Control (current)"><input className="input" value={control} onChange={(e) => setControl(e.target.value)} /></Field>
            <Field label="Treatment (recommended)"><input className="input" value={treatment} onChange={(e) => setTreatment(e.target.value)} /></Field>
          </div>
          <Field label="Common storage conditions"><input className="input" value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Duration (days)"><input className="input" type="number" value={duration} onChange={(e) => setDuration(+e.target.value)} /></Field>
            <Field label="Packs per arm"><input className="input" type="number" value={units} onChange={(e) => setUnits(+e.target.value)} /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <div className="label">Outcomes and pre-registered thresholds</div>
          {metrics.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2 sm:grid-cols-4">
              <input className="input" value={m.label} onChange={(e) => setM(i, { label: e.target.value })} aria-label="Metric" />
              <select className="input" value={m.type} onChange={(e) => setM(i, { type: e.target.value as any, unit: e.target.value === "proportion" ? "pp" : m.unit })}><option value="continuous">measurement</option><option value="proportion">% of packs</option></select>
              <select className="input" value={m.direction} onChange={(e) => setM(i, { direction: e.target.value as any })}><option value="treatment-lower">lower is better</option><option value="treatment-higher">higher is better</option></select>
              <input className="input" type="number" step="any" value={m.minimumDifference} onChange={(e) => setM(i, { minimumDifference: +e.target.value })} aria-label="Minimum difference" title={`Minimum meaningful difference (${m.unit})`} />
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setMetrics([...metrics, { ...DEFAULT_METRICS[metrics.length % 3], key: `m${Date.now() % 10000}` }])}>+ outcome</button>
            <select className="input w-auto py-1" value={primary} onChange={(e) => setPrimary(e.target.value)}>{metrics.map((m) => <option key={m.key} value={m.key}>primary: {m.label}</option>)}</select>
          </div>
          {pm && (
            <div className="rounded-xl bg-surface p-3 text-sm">
              <div className="label">Sample size for the primary outcome (α 0.05, power 0.8)</div>
              {pm.type === "continuous"
                ? <label className="flex items-center gap-2">expected SD <input className="input w-24" type="number" step="any" value={sd} onChange={(e) => setSd(+e.target.value)} /></label>
                : <label className="flex items-center gap-2">expected control rate <input className="input w-24" type="number" step="0.05" value={pc} onChange={(e) => setPc(+e.target.value)} /></label>}
              <div className="mt-1">≈ <strong>{n}</strong> {pm.type === "continuous" ? "samples" : "packs"} per arm to detect {pm.minimumDifference} {pm.unit}.</div>
              {n && units < n && pm.type === "proportion" && <Notice tone="warn">{units} packs per arm may be too few — the result may be inconclusive.</Notice>}
            </div>
          )}
          <ErrorBox error={err} />
          <button className="btn-primary" disabled={title.length < 3} onClick={submit}>Save draft</button>
        </div>
      </div>
    </Card>
  );
}
