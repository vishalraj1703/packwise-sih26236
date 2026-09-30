import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, outbox } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTimeStr } from "../lib/format";
import { Card, Empty, ErrorBox, Notice, Spinner } from "../components/ui";

export default function Shipments() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<any[]>("/shipments").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { if (user) load(); }, [user]);
  if (loading) return <Spinner />;
  if (!user) return <Card><p>Please <Link className="underline" to="/login?next=/shipments">sign in</Link>.</p></Card>;
  return (
    <div className="space-y-5">
      <h1 className="h1">Shipments</h1>
      <p className="muted">Only authorised accounts record events: producers/transporters record dispatch, transporters record handoffs, the assigned buyer or shop records receipt. Events recorded offline are queued and sent later.</p>
      <ErrorBox error={err} />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No shipments assigned to you.</Empty> : rows.map((s) => <ShipmentCard key={s.id} s={s} role={user.role} userId={user.id} onDone={load} />)}
    </div>
  );
}

function ShipmentCard({ s, role, userId, onDone }: { s: any; role: string; userId: number; onDone: () => void }) {
  const [type, setType] = useState<string>(s.status === "created" ? "dispatch" : s.status === "received" ? "storage-check" : role === "retailer" ? "receipt" : "handoff");
  const [location, setLocation] = useState("");
  const [units, setUnits] = useState<number>(s.batches.reduce((a: number, b: any) => a + b.units, 0));
  const [damaged, setDamaged] = useState(0);
  const [temp, setTemp] = useState("");
  const [remarks, setRemarks] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const allowed = [
    (s.created_by === userId || s.transporter_id === userId) && "dispatch",
    s.transporter_id === userId && "handoff",
    (s.receiver_id === userId || (!s.receiver_id && role === "retailer")) && "receipt",
    (s.receiver_id === userId || s.created_by === userId) && "storage-check"
  ].filter(Boolean) as string[];
  if (role === "admin") allowed.push("dispatch", "handoff", "receipt", "storage-check");
  const submit = async () => {
    setErr(null); setMsg(null);
    const body = { type, location: location || undefined, units: type === "receipt" || type === "dispatch" ? units : undefined, condition: { damagedUnits: damaged || undefined, temperatureC: temp === "" ? undefined : +temp, remarks: remarks || undefined }, time: new Date().toISOString() };
    try {
      if (!navigator.onLine) { outbox.add(`/shipments/${s.id}/events`, body, `${type} for ${s.code}`); setMsg("Saved offline — will be sent when connected."); return; }
      const r = await api<{ warnings: string[] }>(`/shipments/${s.id}/events`, { json: body });
      setMsg(`Recorded ${type}.${r.warnings.length ? " " + r.warnings.join(" ") : ""}`);
      onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Card title={<span>{s.code} · {s.origin} → {s.destination}</span>} action={<span className="chip bg-brand-3 text-brand">{s.status}</span>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="text-sm">
          <div className="label">Batches</div>
          {s.batches.map((b: any) => <div key={b.id}><Link className="underline" to={`/batches/${b.id}`}>{b.batch_code}</Link> — {b.commodity_name}, {b.units} units</div>)}
          <div className="label mt-3">Declared</div>
          <div>{s.declared.vehicle}{s.declared.notes && ` · ${s.declared.notes}`}</div>
          <div className="label mt-3">Events</div>
          <ul className="space-y-1 text-xs">{s.events.map((e: any, i: number) => <li key={i}><strong>{e.type}</strong> · {dateTimeStr(e.event_time)} · {e.location ?? ""} {e.units != null && `· ${e.units} units`} {e.condition_json && `· ${e.condition_json}`} <span className="text-ink-3">({e.actor_role})</span></li>)}</ul>
        </div>
        {allowed.length > 0 ? (
          <div className="space-y-2 rounded-xl bg-surface p-3">
            <div className="label">Record an event</div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>{[...new Set(allowed)].map((a) => <option key={a} value={a}>{a}</option>)}</select>
              <input className="input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
              {(type === "receipt" || type === "dispatch") && <input className="input" type="number" value={units} onChange={(e) => setUnits(+e.target.value)} aria-label="Units" />}
              {type === "receipt" && <input className="input" type="number" min={0} placeholder="Damaged units" value={damaged} onChange={(e) => setDamaged(+e.target.value)} aria-label="Damaged units" />}
              <input className="input" type="number" placeholder="Temperature °C (if measured)" value={temp} onChange={(e) => setTemp(e.target.value)} />
              <input className="input" placeholder="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <button className="btn-primary btn-sm" onClick={submit}>Record</button>
            {msg && <Notice tone="good">{msg}</Notice>}
            <ErrorBox error={err} />
          </div>
        ) : <p className="muted">Your account is not authorised to record events for this shipment.</p>}
      </div>
    </Card>
  );
}
