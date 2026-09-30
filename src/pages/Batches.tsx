import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateStr } from "../lib/format";
import { Card, Empty, ErrorBox, Field, Notice, Spinner } from "../components/ui";

export default function Batches() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<any[]>("/batches").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { if (user) load(); }, [user]);
  if (loading) return <Spinner />;
  if (!user) return <Card><p>Please <Link className="underline" to="/login?next=/batches">sign in</Link>.</p></Card>;
  return (
    <div className="space-y-5">
      <h1 className="h1">Batches & QR records</h1>
      <p className="muted">A QR is generated when a packed batch is created and the producer confirms the material actually used. The QR opens a stable record; authorised users add events; a public scan never changes shipment status.</p>
      <ErrorBox error={err} />
      <Card title="Batches">
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No batches yet. Create one from the packing guide of a chosen plan.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead><tr><th>Batch</th><th>Food</th><th>Packs</th><th>Packaging</th><th>Packed</th><th>Issues</th></tr></thead>
              <tbody>{rows.map((b) => (
                <tr key={b.id}>
                  <td><Link className="font-semibold text-brand hover:underline" to={`/batches/${b.id}`}>{b.batch_code}</Link>{b.parent_batch_id && <div className="text-xs text-ink-3">child batch</div>}</td>
                  <td>{b.commodity_name}</td><td>{b.units} × {b.pack_size_kg} kg</td><td className="text-xs">{b.structure_name}{b.oxygen_control !== "none" && ` + ${b.oxygen_control}`}</td>
                  <td>{dateStr(b.packed_at)}</td><td>{b.complaints > 0 ? <span className="chip bg-bad-bg text-bad">{b.complaints}</span> : "–"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {user.role === "producer" && rows && rows.length > 0 && <CreateShipment batches={rows} onDone={load} />}
    </div>
  );
}

function CreateShipment({ batches, onDone }: { batches: any[]; onDone: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [alloc, setAlloc] = useState<Record<number, number>>({});
  const [origin, setOrigin] = useState(batches[0]?.origin ?? "");
  const [destination, setDestination] = useState("");
  const [transporterId, setT] = useState<number | "">("");
  const [receiverId, setR] = useState<number | "">("");
  const [vehicle, setVehicle] = useState("Enclosed goods vehicle");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<any[]>("/users").then(setUsers).catch(() => undefined); }, []);
  const submit = async () => {
    setErr(null); setMsg(null);
    try {
      const list = Object.entries(alloc).filter(([, u]) => u > 0).map(([b, u]) => ({ batchId: +b, units: u }));
      const r = await api<{ code: string }>("/shipments", { json: { origin, destination, transporterId: transporterId || undefined, receiverId: receiverId || undefined, declaredConditions: { vehicle, notes }, batches: list } });
      setMsg(`Shipment ${r.code} created. The transporter can now record dispatch.`);
      setAlloc({}); onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Card title="Create a shipment">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="label">Units per batch</div>
          {batches.filter((b) => !b.parent_batch_id || true).slice(0, 12).map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{b.batch_code} <span className="text-ink-3">({b.units} packs)</span></span>
              <input className="input w-24" type="number" min={0} max={b.units} value={alloc[b.id] ?? 0} onChange={(e) => setAlloc({ ...alloc, [b.id]: +e.target.value })} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="From"><input className="input" value={origin} onChange={(e) => setOrigin(e.target.value)} /></Field>
            <Field label="To"><input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} /></Field>
            <Field label="Transporter"><select className="input" value={transporterId} onChange={(e) => setT(e.target.value ? +e.target.value : "")}><option value="">—</option>{users.filter((u) => u.role === "transporter").map((u) => <option key={u.id} value={u.id}>{u.org ?? u.name}</option>)}</select></Field>
            <Field label="Receiver (buyer/retailer)"><select className="input" value={receiverId} onChange={(e) => setR(e.target.value ? +e.target.value : "")}><option value="">—</option>{users.filter((u) => u.role === "retailer").map((u) => <option key={u.id} value={u.id}>{u.org ?? u.name}</option>)}</select></Field>
          </div>
          <Field label="Declared vehicle / conditions"><input className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></Field>
          <Field label="Handling notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. keep dry, max 6 cartons high" /></Field>
          <button className="btn-primary" disabled={!destination || !Object.values(alloc).some((u) => u > 0)} onClick={submit}>Create shipment</button>
          {msg && <Notice tone="good">{msg}</Notice>}
          <ErrorBox error={err} />
        </div>
      </div>
    </Card>
  );
}
