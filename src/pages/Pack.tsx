import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Candidate } from "../../shared/engine/recommend";
import { EQUIPMENT } from "../../shared/engine/sealing";
import { getCommodity } from "../../shared/data/commodities";
import { api, outbox } from "../lib/api";
import { useAssessment } from "../lib/useAssessment";
import { speak, useI18n } from "../lib/i18n";
import { kg } from "../lib/format";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";
import { StepIllustration, type StepKey } from "../components/Illustrations";

export default function Pack() {
  const { id } = useParams();
  const { a, err, selections } = useAssessment(id);
  const [idx, setIdx] = useState(0);
  if (err) return <Card><ErrorBox error={err} /></Card>;
  if (!a) return <Spinner />;
  const sel = selections[idx];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-ink-3">Step 6–7 · Pack & record</div>
          <h1 className="h1">Pictorial packing guide</h1>
          <p className="muted">Prepare → fill → close/seal → group in carton or crate → arrange shipment → transport → store on arrival.</p>
        </div>
        <div className="flex gap-2"><Link className="btn-ghost" to={`/source/${id}`}>← Source</Link></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {selections.map((s, i) => <button key={s.c.key} onClick={() => setIdx(i)} className={`btn-sm btn ${i === idx ? "bg-brand text-white" : "btn-ghost"}`}>{s.label}</button>)}
      </div>
      {sel && <Guide c={sel.c} label={sel.label} commodityId={a.input.commodityId} />}
      {sel && <CreateBatch c={sel.c} assessmentId={a.id} commodityId={a.input.commodityId} state={a.input.state} origin={a.input.journey.origin.name} />}
    </div>
  );
}

function Guide({ c, label, commodityId }: { c: Candidate; label: string; commodityId: string }) {
  const { t, speech } = useI18n();
  const com = getCommodity(commodityId);
  const fresh = com.foodClass === "fresh";
  const steps: Array<{ key: StepKey; detail: string }> = [
    { key: "prepare", detail: fresh ? "Harvest in the cool morning, pre-cool in shade, remove damaged produce." : `Moisture should be below ${com.moisture?.criticalWb.value ?? "the"}% limit before packing.` },
    { key: "fill", detail: `${kg(c.packSizeKg)} per pack, ${c.units} packs. Leave the top ${c.seal?.sealWidthMm ?? 10} mm clean for sealing.` },
    ...(c.oxygenControl !== "none" ? [{ key: "oxygen" as StepKey, detail: c.oxygenControl === "absorber" ? `Add one ${c.oxygen?.absorberCc} cc absorber sachet per pack, then seal within 15 minutes of opening the sachet bag.` : c.oxygenControl === "gas-flush" ? "Flush with nitrogen to ≤ 2% residual oxygen (check samples with an analyser)." : "Vacuum to a tight fit; do not over-vacuum sharp pieces." }] : []),
    ...(c.sealMethod && c.sealMethod !== "none" ? [{ key: "seal" as StepKey, detail: `${EQUIPMENT[c.sealMethod].label}${c.seal?.sealTempC ? `, sealant range ${c.seal.sealTempC[0]}–${c.seal.sealTempC[1]} °C` : ""}; seal width ≥ ${c.seal?.sealWidthMm ?? 5} mm.${c.viaService ? " Done at the packing service." : ""}` }] : []),
    ...(c.seal ? [{ key: "check" as StepKey, detail: `Check ${c.seal.sampling.sampleSize} packs. Accept only if none leaks.` }] : []),
    ...(c.map?.feasible ? [{ key: "check" as StepKey, detail: `Micro-perforated film: ${c.map.holes} holes of ${c.map.holeDiameterUm} µm — do not cover the holes with labels.` }] : []),
    { key: "label", detail: "Print the batch QR after creating the batch record below." },
    { key: "group", detail: c.cartons ? `${c.cartons.unitsPerCarton} packs per ${c.cartons.grade?.name ?? "carton"} (${c.cartons.cartons} cartons).` : c.crate ? `${c.crate.crates} × ${c.crate.name}; do not overfill.` : "Group securely." },
    { key: "load", detail: c.cartons ? `Stack at most ${c.cartons.stackLayers} cartons high, column-aligned.` : "Keep crates ventilated; do not cover with plastic sheets." },
    { key: "transport", detail: "Dispatch at the planned time; enclosed vehicle; avoid long stops in the sun." },
    { key: "store", detail: com.storageAdvice }
  ];
  const [playing, setPlaying] = useState<number | null>(null);
  const say = (i: number) => {
    const text = `${t(`ps.${steps[i].key}`)} ${speech.startsWith("en") ? steps[i].detail : ""}`;
    if (speak(text, speech)) setPlaying(i);
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return (
    <Card title={`${t("pack.title")} — ${label}`} action={<button className="btn-ghost btn-sm no-print" onClick={() => window.print()}>Print guide</button>}>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-col rounded-2xl border border-line p-3">
            <div className="flex items-center justify-between"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold">{i + 1}</span>
              <button className="btn-ghost btn-sm no-print" onClick={() => (playing === i ? (window.speechSynthesis.cancel(), setPlaying(null)) : say(i))} aria-label={t("pack.listen")}>{playing === i ? `■ ${t("pack.stop")}` : `🔊 ${t("pack.listen")}`}</button>
            </div>
            <StepIllustration step={s.key} format={c.format} />
            <p className="text-sm font-semibold">{t(`ps.${s.key}`)}</p>
            <p className="mt-1 text-xs text-ink-2">{s.detail}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-3">Guide generated from the selected plan; content awaits expert review. Audio uses the device voice for the chosen language — quality of Tamil/Hindi offline voices varies by phone.</p>
    </Card>
  );
}

function CreateBatch({ c, assessmentId, commodityId, state, origin }: { c: Candidate; assessmentId: number; commodityId: string; state: string; origin: string }) {
  const [lots, setLots] = useState<any[]>([]);
  const [lotId, setLotId] = useState<number | "">("");
  const [units, setUnits] = useState(c.units);
  const [packedAt, setPackedAt] = useState(new Date().toISOString().slice(0, 16));
  const [harvest, setHarvest] = useState("");
  const [gtin, setGtin] = useState("");
  const [checks, setChecks] = useState({ fillWeightChecked: false, sealVisual: false, leakTested: false, sampleSize: c.seal?.sampling.sampleSize ?? 10, failures: 0, oxygenControlDone: c.oxygenControl === "none" });
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any[]>("/material-lots").then((l) => { setLots(l); const m = l.find((x) => x.structureId === c.structureId); if (m) setLotId(m.id); }).catch(() => undefined); }, [c.structureId]);
  const body = () => ({
    assessmentId, candidateKey: c.key, materialLotId: lotId === "" ? undefined : lotId, commodityId, state, origin, harvestDate: harvest || undefined,
    packedAt: new Date(packedAt).toISOString(), quantityKg: units * c.packSizeKg, units, packSizeKg: c.packSizeKg, structureId: lotStructure() ?? c.structureId, oxygenControl: c.oxygenControl,
    gtin: gtin || undefined, packingChecks: checks
  });
  const lotStructure = () => lots.find((l) => l.id === lotId)?.structureId as string | undefined;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (!navigator.onLine) { outbox.add("/batches", body(), `Batch record (${units} packs)`); setRes({ offline: true }); return; }
      setRes(await api("/batches", { json: body() }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const ok = checks.fillWeightChecked && checks.sealVisual && checks.leakTested && checks.failures === 0 && checks.oxygenControlDone;
  return (
    <Card title="Create the batch record & QR">
      {res?.offline ? <Notice tone="warn">Saved on this device. The batch record and QR will be created when you are back online (see the bar at the top).</Notice> : res ? (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <img src={`/api/qr/${res.publicToken}.svg`} alt={`QR code for batch ${res.batchCode}`} className="h-44 w-44 rounded-xl border border-line bg-white p-2" />
          <div className="space-y-2 text-sm">
            <div className="text-lg font-bold">{res.batchCode}</div>
            <div>Public page: <a className="text-brand underline" href={res.publicUrl}>{res.publicUrl}</a></div>
            {res.warnings.map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}
            <div className="flex gap-2"><Link className="btn-primary btn-sm" to={`/batches/${res.id}`}>Open batch → print labels, ship</Link></div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Packaging material actually used (supplier lot)" hint="The QR is generated only after you confirm the material actually used.">
              <select className="input" value={lotId} onChange={(e) => setLotId(e.target.value === "" ? "" : +e.target.value)}>
                <option value="">— no lot recorded —</option>
                {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_code} · {l.structureName} ({l.accepted ? "accepted" : "rejected"})</option>)}
              </select>
            </Field>
            {lotId !== "" && lotStructure() !== c.structureId && <Notice tone="warn">This lot is a different structure from the recommended option — the recommendation will not apply to this batch.</Notice>}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Packs filled"><input className="input" type="number" min={1} value={units} onChange={(e) => setUnits(+e.target.value)} /></Field>
              <Field label="Packed at"><input className="input" type="datetime-local" value={packedAt} onChange={(e) => setPackedAt(e.target.value)} /></Field>
              <Field label="Harvest / manufacture date"><input className="input" type="date" value={harvest} onChange={(e) => setHarvest(e.target.value)} /></Field>
              <Field label="GTIN (optional)" hint="Only if you have a GS1-assigned product code"><input className="input" value={gtin} onChange={(e) => setGtin(e.target.value.replace(/\D/g, ""))} /></Field>
            </div>
          </div>
          <div className="space-y-2">
            <div className="label">Packing checks performed</div>
            {([["fillWeightChecked", "Fill weight checked"], ["sealVisual", "Seals visually even — no wrinkles or product in seal"], ["leakTested", "Leak / squeeze test done on samples"], ["oxygenControlDone", c.oxygenControl === "none" ? "No oxygen control required" : `Oxygen control done (${c.oxygenControl})`]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!(checks as any)[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />{l}</label>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Samples tested"><input className="input" type="number" value={checks.sampleSize} onChange={(e) => setChecks({ ...checks, sampleSize: +e.target.value })} /></Field>
              <Field label="Samples failed"><input className="input" type="number" min={0} value={checks.failures} onChange={(e) => setChecks({ ...checks, failures: +e.target.value })} /></Field>
            </div>
            {checks.failures > 0 && <Notice tone="bad">With a zero-acceptance plan, any failure rejects the lot: fix sealing settings and re-check before creating the batch.</Notice>}
            <ErrorBox error={err} />
            <button className="btn-primary w-full" disabled={busy || !ok} onClick={submit}>{busy ? "Creating…" : "Create batch record & QR"}</button>
            {!ok && <p className="text-xs text-ink-3">Complete the packing checks to create the batch.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
