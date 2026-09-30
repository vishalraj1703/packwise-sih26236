import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { dateStr, dateTimeStr } from "../lib/format";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";

const EV: Record<string, string> = { packed: "Packed", dispatch: "Dispatched", handoff: "Handed over in transit", receipt: "Received by buyer/shop", split: "Split into smaller lots", repack: "Repacked" };
const CATS: Array<[string, string]> = [["damaged-pack", "Damaged pack"], ["leaking-seal", "Seal open / leaking"], ["moisture-soft", "Soft / damp / lumpy"], ["rancid-smell", "Rancid or bad smell"], ["mould-insects", "Mould or insects"], ["foreign-matter", "Foreign matter"], ["wrong-quantity", "Wrong quantity"], ["other", "Other"]];

/** Public, read-only scan page. Viewing never changes shipment status. */
export default function PublicBatch() {
  const { token } = useParams();
  const { lang } = useI18n();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/public/batch/${token}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message));
  }, [token]);
  if (err) return <Card><ErrorBox error={err} /></Card>;
  if (!d) return <Spinner />;
  const localName = lang !== "en" ? d.names?.[lang] : null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="text-xs font-semibold uppercase text-ink-3">Batch {d.batchCode}</div>
        <h1 className="h1">{d.commodity}{localName && <span className="block text-xl text-ink-2">{localName}</span>}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="label">Producer</dt><dd>{d.producer}</dd></div>
          <div><dt className="label">Origin</dt><dd>{d.origin}</dd></div>
          <div><dt className="label">Packed on</dt><dd>{dateStr(d.packedAt)}</dd></div>
          {d.harvestDate && <div><dt className="label">Harvest / made</dt><dd>{dateStr(d.harvestDate)}</dd></div>}
          <div className="col-span-2"><dt className="label">Packaging</dt><dd>{d.packaging}{d.oxygenControl !== "none" && ` (${d.oxygenControl.replace("-", " ")})`}</dd></div>
          <div className="col-span-2"><dt className="label">How to store</dt><dd>{d.handling.storage}</dd></div>
          <div className="col-span-2"><dt className="label">Disposal</dt><dd>{d.handling.disposal}</dd></div>
        </dl>
        {d.parentBatch && <p className="mt-2 text-xs text-ink-3">Part of batch {d.parentBatch}.</p>}
        <p className="mt-3 text-xs text-ink-3">{d.note}</p>
      </Card>
      <Card title="Journey">
        <ol className="space-y-2 text-sm">{d.events.map((e: any, i: number) => <li key={i} className="flex justify-between gap-2 border-b border-line pb-1"><span><strong>{EV[e.type] ?? e.type}</strong>{e.location && ` · ${e.location}`}</span><span className="text-ink-3">{dateTimeStr(e.time)}</span></li>)}</ol>
      </Card>
      <ReportIssue token={token!} />
    </div>
  );
}

function ReportIssue({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("damaged-pack");
  const [desc, setDesc] = useState("");
  const [unit, setUnit] = useState("");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append("category", cat); fd.append("description", desc);
    if (unit) fd.append("unitSerial", unit);
    if (consent) { fd.append("consent", "yes"); if (name) fd.append("contactName", name); if (phone) fd.append("contactPhone", phone); if (email) fd.append("contactEmail", email); }
    Array.from(files ?? []).slice(0, 3).forEach((f) => fd.append("photos", f));
    try {
      const r = await fetch(`/api/public/batch/${token}/complaint`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(j.message); setOpen(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (msg) return <Notice tone="good">{msg}</Notice>;
  return (
    <Card title="Report a problem with this product">
      {!open ? <button className="btn-primary" onClick={() => setOpen(true)}>Report an issue</button> : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="What is the problem?"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Describe it"><textarea className="input min-h-24" value={desc} onChange={(e) => setDesc(e.target.value)} required minLength={5} maxLength={2000} /></Field>
          <Field label="Unit number on label (optional)"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. PW260928-CAS-0001-U0002" /></Field>
          <Field label="Photos (optional, up to 3)"><input className="input" type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I agree to share my contact details with the producer for follow-up. They are never shown publicly.</label>
          {consent && <div className="grid gap-2 sm:grid-cols-3"><input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} /><input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
          <ErrorBox error={err} />
          <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
        </form>
      )}
    </Card>
  );
}
