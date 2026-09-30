import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SUPPLIER_PRODUCTS, SUPPLIERS, getSupplier } from "../../shared/data/suppliers";
import { getStructure, MATERIALS } from "../../shared/data/materials";
import { structureAtTest } from "../../shared/engine/barrier";
import type { Candidate } from "../../shared/engine/recommend";
import { api } from "../lib/api";
import { useAssessment } from "../lib/useAssessment";
import { inr, inr2, kg, sig } from "../lib/format";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";
import { PackIllustration } from "../components/Illustrations";
import RealLifeExamples from "../components/RealLifeExamples";
import { plainName } from "../../shared/data/materials";

export default function Source() {
  const { id } = useParams();
  const { a, err, plan, selections } = useAssessment(id);
  if (err) return <Card><ErrorBox error={err} /></Card>;
  if (!a || !plan) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-ink-3">Step 6 · Source</div>
          <h1 className="h1">Recognise and buy the correct material</h1>
          <p className="muted">Selection → purchase specification → supplier comparison → sample/quotation → order → receiving check → record material lot.</p>
        </div>
        <div className="flex gap-2"><Link className="btn-ghost" to={`/results/${id}`}>← Options</Link><Link className="btn-primary" to={`/pack/${id}`}>Packing guide →</Link></div>
      </div>
      <Notice tone="info">Supplier names, prices, stock and responses in this prototype are <strong>simulated</strong>. A quotation workflow is sufficient for the prototype; live stock and checkout need real supplier arrangements. Paid visibility never overrides technical eligibility.</Notice>
      {selections.map(({ c, label }) => <SourceCard key={c.key} c={c} label={label} assessmentId={a.id} />)}
      <ReceiveLot selections={selections.map((s) => s.c)} />
    </div>
  );
}

function SourceCard({ c, label, assessmentId }: { c: Candidate; label: string; assessmentId: number }) {
  const s = getStructure(c.structureId);
  const at = structureAtTest(s);
  const alternatives = SUPPLIER_PRODUCTS.filter((p) => p.structureId === c.structureId && p.sizesKg.includes(c.packSizeKg));
  const [resp, setResp] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const request = async (supplierId: string, productId: string | undefined, kind: "quotation" | "sample" | "packing-service") => {
    setBusy(`${productId ?? supplierId}-${kind}`); setErr(null);
    try {
      const r = await api(`/quotes`, { json: { assessmentId, supplierId, supplierProductId: productId, kind, units: c.units, sizeKg: c.packSizeKg } });
      setResp((x) => ({ ...x, [`${productId ?? supplierId}-${kind}`]: r }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Card title={<span className="flex items-center gap-3"><PackIllustration format={c.format} className="h-12 w-12" /><span>{label}: {c.units} × {kg(c.packSizeKg)} — {plainName(c.structureId)}<span className="block text-xs font-normal text-ink-3">{s.name}</span></span></span>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3 text-sm">
          <RealLifeExamples structureId={c.structureId} />
          <div className="rounded-xl bg-surface p-3">
            <div className="label">Purchase specification — show this to the supplier</div>
            <ul className="space-y-1">
              <li><strong>Structure:</strong> {c.layersText}</li>
              <li><strong>Fill:</strong> {kg(c.packSizeKg)} per pack · flat size ≈ {c.geometry.flatWidthCm.toFixed(0)} × {c.geometry.flatLengthCm.toFixed(0)} cm {s.zipper ? "· zip closure" : ""}</li>
              {c.moisture && <li><strong>WVTR (38 °C/90% RH, ASTM F1249):</strong> ≤ {sig(Math.min(c.moisture.requiredWvtrP50, 1e5))} g/m²·day required{!Number.isNaN(at.wvtr) && <> — generic value for this structure {sig(at.wvtr)}</>}</li>}
              {c.oxygen && c.moisture && c.moisture.targetDays > 30 && <li><strong>OTR (23 °C/0% RH, ASTM D3985):</strong> ≤ {sig(c.oxygen.requiredOtr)} cc/m²·day{!Number.isNaN(at.otr) && <> — generic {sig(at.otr)}</>}</li>}
              {c.seal?.sealTempC && <li><strong>Sealant:</strong> heat-seal range {c.seal.sealTempC[0]}–{c.seal.sealTempC[1]} °C compatible with your {c.seal.method.replace(/-/g, " ")}</li>}
              {c.map?.feasible && <li><strong>Micro-perforation:</strong> {c.map.holes} holes × {c.map.holeDiameterUm} µm per pack (laser)</li>}
              {c.oxygen?.absorberCc && <li><strong>Oxygen absorber:</strong> {c.oxygen.absorberCc} cc sachets × {c.units}</li>}
              <li><strong>Food contact:</strong> {s.layers.length ? MATERIALS[s.layers[s.layers.length - 1].materialId].foodContactNote : "Supplier declaration of food-contact suitability."}</li>
            </ul>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="label">Purchase checks</div>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li><strong>Technical:</strong> grade/structure, thickness, OTR/WVTR with units, test conditions and documentation.</li>
              <li><strong>Practical:</strong> pack dimensions, closure, sealing equipment and operating range.</li>
              <li><strong>Commercial:</strong> quantity, MOQ, setup costs, delivered price, lead time, substitution terms.</li>
              <li><strong>Receipt:</strong> delivered product and lot match the order; test sample seals. Appearance alone cannot verify barrier performance.</li>
            </ul>
          </div>
        </div>
        <div className="space-y-3">
          <div className="label">Matching suppliers (documented performance first)</div>
          {alternatives.sort((x, y) => docRank(y.documentation) - docRank(x.documentation) || x.unitPriceInr[String(c.packSizeKg)] - y.unitPriceInr[String(c.packSizeKg)]).map((p) => {
            const sup = getSupplier(p.supplierId);
            const q = resp[`${p.id}-quotation`], sm = resp[`${p.id}-sample`];
            return (
              <div key={p.id} className={`rounded-xl border p-3 text-sm ${p.id === c.supplierProductId ? "border-brand" : "border-line"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{sup.name} {p.id === c.supplierProductId && <span className="chip bg-brand-3 text-brand">used in plan</span>}</div>
                  <span className="chip bg-surface text-ink-2">{p.documentation.replace(/-/g, " ")}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-ink-2 sm:grid-cols-4">
                  <span>{inr2(p.unitPriceInr[String(c.packSizeKg)])}/pack</span><span>MOQ {p.moqUnits}</span><span>Setup {inr(p.setupCostInr)}</span><span>Lead {p.leadTimeDays} d</span>
                </div>
                {p.declared.otr !== undefined && <div className="mt-1 text-xs">Declared: OTR {p.declared.otr} · WVTR {p.declared.wvtr} — {p.declared.testConditions}{p.declared.reportDate ? ` (report ${p.declared.reportDate})` : ""}</div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => request(p.supplierId, p.id, "quotation")}>Request quotation</button>
                  <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => request(p.supplierId, p.id, "sample")}>Request sample</button>
                </div>
                {q && <Notice tone="info">Quotation #{q.id} (simulated): {q.response.unitsQuoted} units × {inr2(q.response.unitPriceInr)} + setup {inr(q.response.setupCostInr)} = <strong>{inr(q.response.subtotalInr)}</strong> + GST. Lead time {q.response.leadTimeDays} days. Valid until {q.response.validUntil}.</Notice>}
                {sm && <Notice tone="info">Sample request #{sm.id} (simulated): {sm.response.sampleUnits} units, charge {inr(sm.response.chargeInr)} + courier {inr(sm.response.courierInr)}, dispatch in {sm.response.dispatchDays} days.</Notice>}
              </div>
            );
          })}
          {c.viaService && (() => {
            const svc = SUPPLIERS.find((x) => x.id === c.viaService)!;
            const r = resp[`${svc.id}-packing-service`];
            return (
              <div className="rounded-xl border border-info/30 bg-info-bg/40 p-3 text-sm">
                <div className="font-semibold">Packing service: {svc.name}</div>
                <div className="text-xs text-ink-2">Methods: {svc.packingService!.methods.join(", ")} · ₹{svc.packingService!.pricePerPackInr}/pack, min {inr(svc.packingService!.minChargeInr)}</div>
                <button className="btn-ghost btn-sm mt-2" disabled={!!busy} onClick={() => request(svc.id, undefined, "packing-service")}>Request packing-service quote</button>
                {r && <Notice tone="info">Quote #{r.id} (simulated): {inr(r.response.totalInr)} for {c.units} packs, valid until {r.response.validUntil}. No booking made.</Notice>}
              </div>
            );
          })()}
          <ErrorBox error={err} />
        </div>
      </div>
    </Card>
  );
}

const docRank = (d: string) => (d === "third-party-test-report" ? 2 : d === "supplier-declared" ? 1 : 0);

function ReceiveLot({ selections }: { selections: Candidate[] }) {
  const products = [...new Set(selections.map((c) => c.supplierProductId).filter(Boolean))] as string[];
  const [pid, setPid] = useState(products[0] ?? "");
  const [lotCode, setLotCode] = useState("");
  const [units, setUnits] = useState(100);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [checks, setChecks] = useState({ technicalMatch: false, dimensionsOk: false, lotMatchesOrder: false, sampleSealOk: false, documentsReceived: false, notes: "" });
  const [lots, setLots] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<any[]>("/material-lots").then(setLots).catch(() => undefined);
  useEffect(() => { load(); }, []);
  const submit = async () => {
    setErr(null); setMsg(null);
    try {
      const r = await api<{ id: number; accepted: boolean }>("/material-lots", { json: { supplierProductId: pid, lotCode, receivedAt: date, unitsReceived: units, checks } });
      setMsg(r.accepted ? `Lot recorded (#${r.id}) and accepted.` : `Lot recorded (#${r.id}) but NOT accepted — failed receiving checks.`);
      load();
    } catch (e) { setErr((e as Error).message); }
  };
  const box = (k: keyof typeof checks, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />{label}</label>
  );
  return (
    <Card title="Receiving check — record the material lot">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Product received">
            <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
              {products.map((p) => { const sp = SUPPLIER_PRODUCTS.find((x) => x.id === p)!; return <option key={p} value={p}>{getSupplier(sp.supplierId).name} — {getStructure(sp.structureId).name}</option>; })}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Supplier lot no."><input className="input" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="from label" /></Field>
            <Field label="Units"><input className="input" type="number" value={units} onChange={(e) => setUnits(+e.target.value)} /></Field>
            <Field label="Received on"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div className="space-y-1.5">
            {box("technicalMatch", "Structure/thickness on label matches the order")}
            {box("dimensionsOk", "Pack dimensions and closure are as specified")}
            {box("lotMatchesOrder", "Delivered lot and quantity match the order")}
            {box("sampleSealOk", "Sample packs sealed and passed a leak check")}
            {box("documentsReceived", "Test report / declaration received for this lot")}
          </div>
          <Field label="Notes"><input className="input" value={checks.notes} onChange={(e) => setChecks({ ...checks, notes: e.target.value })} /></Field>
          <button className="btn-primary" disabled={!pid || lotCode.length < 2} onClick={submit}>Record lot</button>
          {msg && <Notice tone={msg.includes("NOT") ? "warn" : "good"}>{msg}</Notice>}
          <ErrorBox error={err} />
        </div>
        <div>
          <div className="label">Your material lots</div>
          <table className="table-clean"><thead><tr><th>Lot</th><th>Material</th><th>Units</th><th>Check</th></tr></thead>
            <tbody>{lots.map((l) => <tr key={l.id}><td>{l.lot_code}<div className="text-xs text-ink-3">{l.received_at}</div></td><td className="text-xs">{l.structureName}<div className="text-ink-3">{l.supplier}</div></td><td>{l.units_received}</td><td>{l.accepted ? <span className="chip bg-good-bg text-good">accepted</span> : <span className="chip bg-bad-bg text-bad">rejected</span>}</td></tr>)}</tbody></table>
        </div>
      </div>
    </Card>
  );
}
