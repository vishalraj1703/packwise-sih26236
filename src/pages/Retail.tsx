import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTimeStr } from "../lib/format";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";

/** Simulated point-of-sale integration (discussion record p.8). */
export default function Retail() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState("");
  const [qty, setQty] = useState(1);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [key, setKey] = useState<string | null>(null);
  const load = () => api<any[]>("/pos/sales").then(setSales).catch(() => undefined);
  useEffect(() => { if (user?.role === "retailer") load(); }, [user]);
  if (loading) return <Spinner />;
  if (!user || (user.role !== "retailer" && user.role !== "admin")) return <Card><p>This page is for shop accounts. <Link className="underline" to="/login?next=/retail">Sign in</Link> as a retailer.</p></Card>;
  const sell = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setRes(null);
    try { setRes(await api("/pos/sale", { json: { code: code.trim(), quantity: qty } })); setCode(""); load(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="space-y-5">
      <h1 className="h1">Shop billing (simulated POS)</h1>
      <Notice tone="info">A common product barcode (GTIN) identifies the product type, not its batch. For sale traceability the shop records the <strong>batch or unit code</strong> from the QR label at billing — this page simulates that integration.</Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Scan or type the code">
          <form className="space-y-3" onSubmit={sell}>
            <Field label="Batch or unit code" hint="e.g. PW260928-CAS-0001-U0004"><input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required /></Field>
            <Field label="Quantity"><input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} /></Field>
            <button className="btn-primary">Record sale</button>
          </form>
          <ErrorBox error={err} />
          {res && <div className="mt-3 space-y-2"><Notice tone="good">Sale recorded: {res.commodity} · {res.unitSerial ?? res.batchCode}</Notice>{res.warnings.map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}</div>}
        </Card>
        <Card title="Connect your billing software">
          <p className="muted">Your billing system can post sales directly:</p>
          <pre className="mt-2 overflow-auto rounded-xl bg-ink p-3 text-xs text-white">{`POST /api/pos/sale
X-API-Key: <your key>
{"code":"PW260928-CAS-0001-U0005","quantity":1,"store":"Main road"}`}</pre>
          <button className="btn-ghost btn-sm mt-3" onClick={async () => setKey((await api<{ apiKey: string }>("/pos/api-key", { method: "POST" })).apiKey)}>Generate API key</button>
          {key && <Notice tone="warn">Copy now — shown once: <code className="break-all">{key}</code></Notice>}
        </Card>
      </div>
      <Card title="Recent sales">
        <table className="table-clean"><thead><tr><th>Time</th><th>Code</th><th>Qty</th><th>Source</th></tr></thead>
          <tbody>{sales.map((s) => <tr key={s.id}><td>{dateTimeStr(s.sold_at)}</td><td className="font-mono text-xs">{s.unit_serial ?? s.batch_code}</td><td>{s.quantity}</td><td>{s.source}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
