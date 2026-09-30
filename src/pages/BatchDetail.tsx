import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateStr, dateTimeStr } from "../lib/format";
import { Card, ErrorBox, Notice, Spinner } from "../components/ui";

const EVENT_LABEL: Record<string, string> = { packed: "Packed", dispatch: "Dispatched", handoff: "Handoff", receipt: "Received", split: "Split", repack: "Repacked", "storage-check": "Storage check", "retail-sale": "Sold at shop" };

export default function BatchDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [labels, setLabels] = useState(false);
  const load = () => api(`/batches/${id}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (err) return <Card><ErrorBox error={err} /></Card>;
  if (!d) return <Spinner />;
  const b = d.batch;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-ink-3">Batch record</div>
          <h1 className="h1">{b.batch_code}</h1>
          <p className="muted">{b.commodity_name} ({b.state}) · {b.units} × {b.pack_size_kg} kg · packed {dateTimeStr(b.packed_at)} at {b.origin}</p>
          {d.parent && <p className="text-sm">Split from <Link className="underline" to={`/batches/${d.parent.id}`}>{d.parent.batch_code}</Link></p>}
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => { setLabels(true); setTimeout(() => window.print(), 300); }}>Print QR labels</button>
          <a className="btn-ghost btn-sm" href={d.publicUrl} target="_blank" rel="noreferrer">Public page ↗</a>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="text-center">
          <img src={`/api/qr/${b.public_token}.svg`} alt={`QR for ${b.batch_code}`} className="mx-auto h-48 w-48" />
          <div className="mt-2 font-mono text-sm">{b.batch_code}</div>
          <div className="text-xs text-ink-3">Scanning opens the read-only public record</div>
        </Card>
        <Card title="Record">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="label">Packaging used</dt><dd>{b.structure_name}{b.oxygen_control !== "none" && ` + ${b.oxygen_control}`}</dd></div>
            <div><dt className="label">Material lot</dt><dd>{d.lot ? `${d.lot.lot_code} (${d.lot.accepted ? "accepted" : "rejected at receipt"})` : "not linked"}</dd></div>
            <div><dt className="label">Recommendation version</dt><dd className="text-xs">{b.recommendation_version ?? "–"}</dd></div>
            <div><dt className="label">GTIN</dt><dd>{b.gtin ?? "– (product barcode identifies type, not batch)"}</dd></div>
            <div><dt className="label">Storage advice</dt><dd>{b.handling.storage}</dd></div>
            <div><dt className="label">Disposal</dt><dd>{b.handling.disposal} <span className="text-xs text-ink-3">({b.handling.pwmCategory})</span></dd></div>
            <div className="sm:col-span-2"><dt className="label">Packing checks</dt><dd className="text-xs">{Object.entries(b.packingChecks).map(([k, v]) => `${k}: ${v}`).join(" · ")}</dd></div>
          </dl>
          {b.assessment_id && <Link className="mt-3 inline-block text-sm text-brand underline" to={`/results/${b.assessment_id}`}>Open the recommendation →</Link>}
        </Card>
      </div>
      <Card title="Event timeline">
        <ol className="relative space-y-3 border-l-2 border-brand-3 pl-5">
          {d.events.map((e: any) => (
            <li key={e.id} className="text-sm">
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-brand" />
              <div className="font-semibold">{EVENT_LABEL[e.type] ?? e.type} <span className="font-normal text-ink-3">· {dateTimeStr(e.event_time)} · {e.location ?? ""}</span></div>
              <div className="text-xs text-ink-2">by {e.actor_name ?? e.actor_role} ({e.actor_role}){e.units != null && ` · ${e.units} units`}{e.condition_json && ` · ${Object.entries(JSON.parse(e.condition_json)).map(([k, v]) => `${k}: ${v}`).join(", ")}`}{e.notes && ` · ${e.notes}`}</div>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Shipments">
          {d.shipments.length === 0 ? <p className="muted">Not shipped yet. <Link className="underline" to="/batches">Create a shipment</Link>.</p> : (
            <ul className="space-y-1 text-sm">{d.shipments.map((s: any) => <li key={s.id}><strong>{s.code}</strong> → {s.destination} · {s.units} units · <span className="chip bg-surface">{s.status}</span> · {s.transporter ?? "no transporter"} → {s.receiver ?? "no receiver"}</li>)}</ul>
          )}
          {d.children.length > 0 && <div className="mt-3 text-sm"><div className="label">Child batches</div>{d.children.map((c: any) => <div key={c.id}><Link className="underline" to={`/batches/${c.id}`}>{c.batch_code}</Link> ({c.units} units)</div>)}</div>}
          {(user?.role === "producer" || user?.role === "retailer") && <SplitForm batch={b} onDone={load} />}
        </Card>
        <Card title="Retail sales & consumer issues">
          <p className="text-sm">{d.sales.length} sale record(s) · {d.sales.reduce((a: number, s: any) => a + s.quantity, 0)} units sold</p>
          <ul className="mt-2 space-y-1 text-xs text-ink-2">{d.sales.slice(0, 6).map((s: any) => <li key={s.id}>{dateTimeStr(s.sold_at)} · {s.store} · {s.unit_serial ?? s.batch_code} · {s.source}</li>)}</ul>
          <div className="mt-3 space-y-2">{d.complaints.map((c: any) => <Notice key={c.id} tone="warn"><strong>{c.category}</strong> — {c.description} <span className="text-xs">({c.status})</span></Notice>)}</div>
          {d.complaints.length > 0 && <Link className="mt-2 inline-block text-sm text-brand underline" to="/complaints">Investigate →</Link>}
        </Card>
      </div>
      {labels && <LabelSheet batch={b} onClose={() => setLabels(false)} />}
    </div>
  );
}

function SplitForm({ batch, onDone }: { batch: any; onDone: () => void }) {
  const [parts, setParts] = useState("");
  const [reason, setReason] = useState<"split" | "repack">("split");
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    try {
      const list = parts.split(",").map((x) => ({ units: parseInt(x.trim(), 10) })).filter((x) => x.units > 0);
      await api(`/batches/${batch.id}/split`, { json: { parts: list, reason } });
      setParts(""); onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="no-print mt-4 rounded-xl border border-line p-3 text-sm">
      <div className="label">Split or repack (keeps parent–child links)</div>
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={reason} onChange={(e) => setReason(e.target.value as any)}><option value="split">Split</option><option value="repack">Repack</option></select>
        <input className="input w-48" placeholder="units per part, e.g. 60,60" value={parts} onChange={(e) => setParts(e.target.value)} />
        <button className="btn-ghost btn-sm" onClick={submit} disabled={!parts}>Create child batches</button>
      </div>
      <ErrorBox error={err} />
    </div>
  );
}

function LabelSheet({ batch, onClose }: { batch: any; onClose: () => void }) {
  const n = Math.min(batch.units, 24);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white p-6">
      <div className="no-print mb-4 flex justify-between"><strong>Label sheet — first {n} unit labels</strong><button className="btn-ghost btn-sm" onClick={onClose}>Close</button></div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex items-center gap-2 rounded border border-dashed border-ink-3 p-2">
            <img src={`/api/qr/${batch.public_token}.svg`} alt="" className="h-16 w-16" />
            <div className="text-[10px] leading-tight"><div className="font-bold">{batch.commodity_name}</div><div>{batch.batch_code}-U{String(i + 1).padStart(4, "0")}</div><div>Packed {dateStr(batch.packed_at)}</div><div>{batch.pack_size_kg} kg</div></div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">Unit numbers let shop billing record which unit was sold. The QR opens the batch record.</p>
    </div>
  );
}
