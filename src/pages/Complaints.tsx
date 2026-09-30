import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateStr } from "../lib/format";
import { Card, Empty, ErrorBox, Notice, Spinner } from "../components/ui";

export default function Complaints() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [clusters, setClusters] = useState<any>(null);
  const [inv, setInv] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    api<any[]>("/complaints").then(setRows).catch((e) => setErr(e.message));
    api("/complaints/clusters").then(setClusters).catch(() => undefined);
  };
  useEffect(() => { if (user) load(); }, [user]);
  if (loading) return <Spinner />;
  if (!user) return <Card><p>Please <Link className="underline" to="/login?next=/complaints">sign in</Link>.</p></Card>;
  const update = async (id: number, body: any) => { await api(`/complaints/${id}`, { method: "PATCH", json: body }); load(); };
  const investigate = async (lotId: number) => { setInv(null); try { setInv(await api(`/investigate/lot/${lotId}`)); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="space-y-5">
      <h1 className="h1">Consumer issues & investigation</h1>
      <ErrorBox error={err} />
      {clusters && (clusters.byBatch.length > 0 || clusters.byLot.length > 0) && (
        <Card title="Clusters suggesting investigation">
          <Notice tone="warn">{clusters.note}</Notice>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div><div className="label">By batch (last 30 days)</div>{clusters.byBatch.map((c: any) => <div key={c.batch_id + c.category} className="text-sm">{c.batch_code}: <strong>{c.n}</strong> × {c.category}</div>)}</div>
            <div><div className="label">By packaging material lot</div>{clusters.byLot.map((c: any) => <div key={c.lot_id + c.category} className="flex items-center justify-between gap-2 text-sm"><span>Lot {c.lot_code} ({c.structure}): <strong>{c.n}</strong> × {c.category} across {c.batches} batch(es)</span><button className="btn-ghost btn-sm" onClick={() => investigate(c.lot_id)}>Trace lot</button></div>)}</div>
          </div>
        </Card>
      )}
      {inv && (
        <Card title={`Material lot ${inv.lot.lot_code} — ${inv.lot.structure}`}>
          <p className="muted">Supplier: {inv.lot.supplier} · received {inv.lot.received_at} · receiving check {inv.lot.accepted ? "passed" : "failed"}</p>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
            <div><div className="label">Batches using this lot</div>{inv.batches.map((b: any) => <div key={b.id}><Link className="underline" to={`/batches/${b.id}`}>{b.batch_code}</Link> · {b.units} units</div>)}</div>
            <div><div className="label">Recorded destinations</div>{inv.shipments.map((s: any, i: number) => <div key={i}>{s.code} → {s.destination} ({s.status}, {s.units} units)</div>)}{inv.sales.map((s: any, i: number) => <div key={`s${i}`}>Sold at {s.store}: {s.units}</div>)}</div>
            <div><div className="label">Reports</div>{inv.complaints.map((c: any) => <div key={c.category}>{c.category}: {c.n}</div>)}</div>
          </div>
        </Card>
      )}
      <Card title="Reports">
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No reports.</Empty> : (
          <div className="space-y-3">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><strong>{c.category}</strong> · <Link className="underline" to={`/batches/${c.batch_id}`}>{c.batch_code}</Link>{c.unit_serial && ` · ${c.unit_serial}`} · {dateStr(c.created_at)}</div>
                  <select className="input w-auto py-1" value={c.status} onChange={(e) => update(c.id, { status: e.target.value })}>
                    {["new", "investigating", "resolved", "not-packaging-related"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <p className="mt-1">{c.description}</p>
                {c.photos.length > 0 && <div className="mt-2 flex gap-2">{c.photos.map((p: string) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="Reported issue" className="h-16 w-16 rounded-lg object-cover" /></a>)}</div>}
                {(c.contact_name || c.contact_phone || c.contact_email) && <p className="mt-1 text-xs text-ink-2">Contact (shared with consent, private): {[c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(" · ")}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input className="input flex-1" placeholder="Follow-up notes" defaultValue={c.manufacturer_notes ?? ""} onBlur={(e) => e.target.value !== (c.manufacturer_notes ?? "") && update(c.id, { notes: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!c.reviewed} onChange={(e) => update(c.id, { reviewed: e.target.checked })} />reviewed (eligible for model feedback)</label>
                  {c.material_lot_id && <button className="btn-ghost btn-sm" onClick={() => investigate(c.material_lot_id)}>Trace material lot</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
