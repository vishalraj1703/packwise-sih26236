import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { COMMODITIES, getCommodity, searchCommodities } from "../../shared/data/commodities";
import { offlineJourney, type JourneyAnalysis, type Place, type StorageType } from "../../shared/engine/journey";
import type { AssessmentInput, Portion } from "../../shared/engine/recommend";
import { recommend } from "../../shared/engine/recommend";
import { compact } from "../../shared/engine/reassess";
import { EQUIPMENT } from "../../shared/engine/sealing";
import type { Evidenced, SealMethod } from "../../shared/types";
import { api, local } from "../lib/api";
import { idb } from "../lib/idb";
import { useAuth } from "../lib/auth";
import { foodImage } from "../lib/images";
import { useI18n } from "../lib/i18n";
import { PRESET_PLACES } from "../lib/places";
import { Card, ErrorBox, Field, Notice, Spinner, StatusBadge } from "../components/ui";

type Step = 0 | 1 | 2 | 3 | 4;
interface Draft {
  commodityId: string | null;
  state: string;
  identification: AssessmentInput["identification"];
  aiNote?: string;
  portions: Portion[];
  budget?: number;
  origin: Place | null;
  destination: Place | null;
  departureDate: string;
  journey: JourneyAnalysis | null;
  equipment: SealMethod[];
  moisture?: Evidenced;
  rco2?: Evidenced;
  measurements: Record<string, Evidenced>;
}

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const blank = (): Draft => ({
  commodityId: null, state: "", identification: { method: "user-select", confirmed: false },
  portions: [{ id: "p1", label: "Portion 1", kg: 50, use: "retail", storageDays: 14, storage: { type: "ambient-room", status: "assumed" }, packSizeKg: null }],
  origin: null, destination: null, departureDate: inDays(5), journey: null, equipment: ["heat-impulse"], measurements: {}
});

const cashewExample = (): Draft => ({
  ...blank(),
  commodityId: "cashew-kernel", state: "unroasted", identification: { method: "user-select", confirmed: true },
  portions: [
    { id: "p1", label: "Bulk — immediate use", kg: 50, use: "bulk", storageDays: 2, storage: { type: "ambient-room", status: "assumed" }, packSizeKg: null },
    { id: "p2", label: "Retail — up to 2 weeks", kg: 20, use: "retail", storageDays: 14, storage: { type: "ambient-room", status: "assumed" }, packSizeKg: null },
    { id: "p3", label: "Retail — 5 months", kg: 30, use: "retail", storageDays: 150, storage: { type: "ambient-room", status: "assumed" }, packSizeKg: null }
  ],
  origin: PRESET_PLACES[0], destination: PRESET_PLACES[1]
});

export default function Assess() {
  const { t } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>(0);
  const [d, setD] = useState<Draft>(() => (params.get("example") === "cashew" ? cashewExample() : local.get<Draft>("packwise-draft", blank())));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { local.set("packwise-draft", d); }, [d]);
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const commodity = d.commodityId ? getCommodity(d.commodityId) : null;
  const steps = [t("step.food"), t("step.order"), t("step.journey"), t("step.evidence"), t("step.review")];
  const canNext = [
    !!commodity && d.identification.confirmed && !!d.state,
    d.portions.length > 0 && d.portions.every((p) => p.kg > 0 && p.storageDays >= 0),
    !!d.journey,
    true,
    true
  ][step];

  const buildInput = (): AssessmentInput => ({
    commodityId: d.commodityId!, state: d.state as any, identification: d.identification, portions: d.portions,
    properties: { initialMoistureWb: d.moisture, rco2At20: d.rco2, measurements: Object.keys(d.measurements).length ? d.measurements : undefined },
    equipment: d.equipment, budgetInrPerKg: d.budget || undefined, journey: d.journey!, userState: d.origin?.state
  });

  const run = async () => {
    setBusy(true); setErr(null);
    const input = buildInput();
    try {
      if (user && navigator.onLine) {
        const r = await api<{ id: number }>("/assessments", { json: { input } });
        nav(`/results/${r.id}`);
      } else {
        // not signed in: the Python engine on the server computes, nothing is stored server-side
        const result = await api<ReturnType<typeof compact>>("/assessments/compute", { json: input });
        await idb.set("local-result", { input, result, createdAt: new Date().toISOString() });
        nav("/results/local");
      }
    } catch (e) {
      // offline or server error: compute on this device
      const result = compact(recommend(input));
      await idb.set("local-result", { input, result, createdAt: new Date().toISOString() });
      nav("/results/local");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{t("nav.assess")}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => { setD(cashewExample()); setStep(0); }}>Load cashew example</button>
          <button className="btn-ghost btn-sm" onClick={() => { setD(blank()); setStep(0); }}>Start over</button>
        </div>
      </div>
      <ol className="grid grid-cols-5 gap-2">
        {steps.map((s, i) => (
          <li key={s}>
            <button onClick={() => i <= step && setStep(i as Step)} className={`w-full rounded-xl px-2 py-2 text-left text-xs font-semibold sm:text-sm ${i === step ? "bg-brand text-white" : i < step ? "bg-brand-3 text-brand" : "bg-white text-ink-3 border border-line"}`}>
              <span className="mr-1 opacity-70">{i + 1}.</span>{s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <FoodStep d={d} up={up} />}
      {step === 1 && <OrderStep d={d} up={up} />}
      {step === 2 && <JourneyStep d={d} up={up} />}
      {step === 3 && <EvidenceStep d={d} up={up} />}
      {step === 4 && <ReviewStep d={d} />}

      <ErrorBox error={err} />
      <div className="flex justify-between">
        <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((step - 1) as Step)}>← Back</button>
        {step < 4 ? (
          <button className="btn-primary" disabled={!canNext} onClick={() => setStep((step + 1) as Step)}>Next →</button>
        ) : (
          <button className="btn-accent" disabled={busy} onClick={run}>{busy ? <Spinner label="Evaluating options…" /> : t("run")}</button>
        )}
      </div>
    </div>
  );
}

type StepProps = { d: Draft; up: (p: Partial<Draft>) => void };

function FoodStep({ d, up }: StepProps) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [ai, setAi] = useState<{ available: boolean } | null>(null);
  const [aiRes, setAiRes] = useState<any>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { api<{ ai: boolean }>("/status").then((s) => setAi({ available: s.ai })).catch(() => setAi({ available: false })); }, []);
  const list = useMemo(() => searchCommodities(q), [q]);
  const c = d.commodityId ? getCommodity(d.commodityId) : null;
  const onPhoto = async (f: File) => {
    setPreview(URL.createObjectURL(f));
    setAiErr(null); setAiRes(null);
    if (!ai?.available) return;
    setAiBusy(true);
    const fd = new FormData(); fd.append("photo", f);
    try {
      const r = await fetch("/api/ai/identify", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setAiRes(j);
    } catch (e) { setAiErr((e as Error).message); } finally { setAiBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card title={t("food.photo")}>
        <input type="file" accept="image/*" capture="environment" className="input" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        {preview && <img src={preview} alt="Uploaded food" className="mt-3 max-h-52 rounded-xl object-cover" />}
        {ai && !ai.available && <p className="mt-2 text-xs text-ink-3">Photo identification is not configured on this server (or you are offline). Choose the food from the list.</p>}
        {aiBusy && <div className="mt-3"><Spinner label="Looking at the photo…" /></div>}
        <ErrorBox error={aiErr} />
        {aiRes && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-ink-3">AI suggestions — please confirm</div>
            {aiRes.candidates.map((x: any) => (
              <button key={x.commodityId + x.processingState} disabled={x.commodityId === "other"}
                onClick={() => { const cc = getCommodity(x.commodityId); up({ commodityId: cc.id, state: cc.states.includes(x.processingState) ? x.processingState : cc.defaultState, identification: { method: "photo-ai", confirmed: false, confidence: x.confidence }, aiNote: x.visibleCondition }); }}
                className="w-full rounded-xl border border-line px-3 py-2 text-left hover:border-brand-2 disabled:opacity-50">
                <div className="flex justify-between text-sm font-semibold"><span>{x.commonName}</span><span>{Math.round(x.confidence * 100)}%</span></div>
                <div className="text-xs text-ink-2">{x.processingState} · {x.visibleCondition}</div>
              </button>
            ))}
            {aiRes.cannotBeDeterminedFromPhoto?.length > 0 && <Notice tone="warn">Not determinable from a photo: {aiRes.cannotBeDeterminedFromPhoto.join(", ")}.</Notice>}
          </div>
        )}
        <div className="mt-4 rounded-xl bg-surface p-3 text-xs text-ink-2">
          <strong>What a photo can and cannot tell:</strong> it can suggest identity and visible condition. It cannot establish pH, moisture, fat content, respiration or microbial condition.
        </div>
      </Card>
      <Card title={t("food.select")}>
        <input className="input mb-3" placeholder="Search: cashew, tomato, மஞ்சள், काजू…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
          {list.map((x) => (
            <button key={x.id} onClick={() => up({ commodityId: x.id, state: x.defaultState, identification: { method: "user-select", confirmed: false } })}
              className={`rounded-xl border px-3 py-2 text-left ${d.commodityId === x.id ? "border-brand bg-brand-3" : "border-line bg-white hover:border-brand-2"}`}>
              {foodImage(x.id) && <img src={foodImage(x.id)!} alt="" className="mb-1 h-20 w-full rounded-lg object-cover" />}
              <div className="text-sm font-semibold">{x.name}</div>
              <div className="text-xs text-ink-3">{x.names.ta} · {x.foodClass}</div>
            </button>
          ))}
        </div>
        {c && (
          <div className="mt-4 space-y-3 rounded-xl border border-line p-3">
            <Field label={t("food.state")}>
              <select className="input" value={d.state} onChange={(e) => up({ state: e.target.value })}>
                {c.states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            {d.aiNote && <p className="text-xs text-ink-2">Visible condition (AI): {d.aiNote}</p>}
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={d.identification.confirmed} onChange={(e) => up({ identification: { ...d.identification, confirmed: e.target.checked } })} />
              {t("food.confirm")}: {c.name} ({d.state})
            </label>
            {c.review === "unreviewed-seed" && <p className="text-xs text-warn">Reference data for this food are seed values awaiting expert review.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

function OrderStep({ d, up }: StepProps) {
  const { t } = useI18n();
  const c = getCommodity(d.commodityId!);
  const setP = (i: number, p: Partial<Portion>) => up({ portions: d.portions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const total = d.portions.reduce((a, p) => a + p.kg, 0);
  return (
    <Card title={<span className="flex items-center gap-3">{foodImage(c.id) && <img src={foodImage(c.id)!} alt="" className="h-10 w-10 rounded-lg object-cover" />}{c.name} — split the order by use and storage need</span>}>
      <p className="muted mb-4">Different portions may need different packs. Example: bulk for immediate use, retail for two weeks, retail for five months.</p>
      <div className="space-y-3">
        {d.portions.map((p, i) => (
          <div key={p.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.8fr_0.7fr_1fr_0.9fr_auto]">
            <Field label={t("order.portion")}><input className="input" value={p.label} onChange={(e) => setP(i, { label: e.target.value })} /></Field>
            <Field label={t("order.kg")}><input className="input" type="number" min={0.1} step="any" value={p.kg} onChange={(e) => setP(i, { kg: +e.target.value })} /></Field>
            <Field label={t("order.use")}>
              <select className="input" value={p.use} onChange={(e) => setP(i, { use: e.target.value as any, packSizeKg: null })}><option value="retail">Retail packs</option><option value="bulk">Bulk</option></select>
            </Field>
            <Field label={t("order.days")}><input className="input" type="number" min={0} max={730} value={p.storageDays} onChange={(e) => setP(i, { storageDays: +e.target.value })} /></Field>
            <Field label={t("order.storage")}>
              <select className="input" value={p.storage.type} onChange={(e) => setP(i, { storage: { ...p.storage, type: e.target.value as StorageType } })}>
                <option value="ambient-room">Ordinary room</option><option value="cool-room">Cool room (~15 °C)</option><option value="cold-room">Cold room (~4 °C)</option><option value="retail-shelf">Retail shelf</option>
              </select>
            </Field>
            <Field label={t("order.pack")}>
              <select className="input" value={p.packSizeKg ?? ""} onChange={(e) => setP(i, { packSizeKg: e.target.value ? +e.target.value : null })}>
                <option value="">Let PackWise compare</option>
                {(p.use === "retail" ? [0.1, 0.25, 0.5, 1, 2] : [5, 10, 20, 25, 50]).map((s) => <option key={s} value={s}>{s} kg</option>)}
              </select>
            </Field>
            <div className="flex items-end"><button className="btn-ghost btn-sm" disabled={d.portions.length === 1} onClick={() => up({ portions: d.portions.filter((_, j) => j !== i) })} aria-label="Remove portion">✕</button></div>
            <details className="sm:col-span-2 lg:col-span-7">
              <summary className="cursor-pointer text-xs font-semibold text-brand">I know this room's temperature / humidity</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Field label="Temperature °C"><input className="input" type="number" value={p.storage.tC ?? ""} onChange={(e) => setP(i, { storage: { ...p.storage, tC: e.target.value === "" ? undefined : +e.target.value, status: e.target.value === "" ? "assumed" : p.storage.status === "assumed" ? "user" : p.storage.status } })} /></Field>
                <Field label="Relative humidity %"><input className="input" type="number" value={p.storage.rhPct ?? ""} onChange={(e) => setP(i, { storage: { ...p.storage, rhPct: e.target.value === "" ? undefined : +e.target.value, status: e.target.value === "" ? "assumed" : p.storage.status === "assumed" ? "user" : p.storage.status } })} /></Field>
                <Field label="How known"><select className="input" value={p.storage.status} onChange={(e) => setP(i, { storage: { ...p.storage, status: e.target.value as any } })}><option value="assumed">Assumed</option><option value="user">My estimate</option><option value="measured">Measured (hygrometer)</option></select></Field>
              </div>
            </details>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost btn-sm" disabled={d.portions.length >= 6} onClick={() => up({ portions: [...d.portions, { id: `p${Date.now() % 100000}`, label: `Portion ${d.portions.length + 1}`, kg: 10, use: "retail", storageDays: 14, storage: { type: "ambient-room", status: "assumed" }, packSizeKg: null }] })}>+ {t("order.add")}</button>
        <div className="text-sm text-ink-2">Total: <strong>{total} kg</strong></div>
        <Field label="Budget ₹ per kg (optional)"><input className="input w-40" type="number" min={0} value={d.budget ?? ""} onChange={(e) => up({ budget: e.target.value ? +e.target.value : undefined })} /></Field>
      </div>
    </Card>
  );
}

function PlacePicker({ label, value, onChange }: { label: string; value: Place | null; onChange: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Place[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (q.length < 3) { setRes([]); return; }
    const local = PRESET_PLACES.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    setRes(local);
    const h = setTimeout(() => {
      if (!navigator.onLine) return;
      api<Place[]>(`/geocode?q=${encodeURIComponent(q)}`).then((r) => { setRes([...local, ...r.filter((x) => !local.some((l) => l.name === x.name))]); setNote(null); }).catch((e) => setNote(e.message));
    }, 350);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <Field label={label}>
      {value && <div className="mb-1 flex items-center justify-between rounded-xl bg-brand-3 px-3 py-2 text-sm font-semibold text-brand">{value.name}<span className="text-xs font-normal">{value.lat.toFixed(3)}, {value.lon.toFixed(3)}</span></div>}
      <input className="input" placeholder="Type a town or city…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-auto rounded-xl border border-line bg-white">
          {res.map((p) => <li key={p.name + p.lat}><button className="w-full px-3 py-2 text-left text-sm hover:bg-brand-3" onClick={() => { onChange(p); setQ(""); setRes([]); }}>{p.name}</button></li>)}
        </ul>
      )}
      {note && <span className="text-xs text-ink-3">{note}</span>}
    </Field>
  );
}

function JourneyStep({ d, up }: StepProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const maxDays = Math.max(...d.portions.map((p) => p.storageDays));
  const analyze = async () => {
    if (!d.origin || !d.destination) return;
    setBusy(true); setErr(null);
    try {
      const j = navigator.onLine
        ? await api<JourneyAnalysis>("/journey/analyze", { json: { origin: d.origin, destination: d.destination, departureDate: d.departureDate, storageDays: maxDays } })
        : offlineJourney(d.origin, d.destination, d.departureDate);
      up({ journey: j });
    } catch {
      up({ journey: offlineJourney(d.origin, d.destination, d.departureDate) });
      setErr("Live route/weather unavailable — using a clearly labelled assumed scenario.");
    } finally { setBusy(false); }
  };
  const j = d.journey;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Where is the food going?">
        <div className="space-y-3">
          <PlacePicker label={t("journey.from")} value={d.origin} onChange={(p) => up({ origin: p, journey: null })} />
          <PlacePicker label={t("journey.to")} value={d.destination} onChange={(p) => up({ destination: p, journey: null })} />
          <Field label={t("journey.date")}><input className="input" type="date" min={today()} value={d.departureDate} onChange={(e) => up({ departureDate: e.target.value, journey: null })} /></Field>
          <button className="btn-primary w-full" disabled={!d.origin || !d.destination || busy} onClick={analyze}>{busy ? <Spinner label="Analysing route and weather…" /> : t("journey.analyze")}</button>
          <ErrorBox error={err} />
          <p className="text-xs text-ink-3">Vehicle options (shared load, dedicated vehicle, refrigerated where justified) are compared automatically as part of each plan.</p>
        </div>
      </Card>
      <Card title="Exposure analysis">
        {!j ? <p className="muted">Analyse the route to see distance, travel time, forecast and destination climate.</p> : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface p-3"><div className="label">Distance</div><div className="text-lg font-bold">{j.distanceKm} km</div><div className="text-xs text-ink-3">{j.routeSource === "osrm" ? "Road route (OSRM)" : "Estimate"}</div></div>
              <div className="rounded-xl bg-surface p-3"><div className="label">Driving time (goods vehicle)</div><div className="text-lg font-bold">{j.driveHours} h</div></div>
            </div>
            <div>
              <div className="label">Transit weather</div>
              {j.transitWeather.map((w) => (
                <div key={w.date} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5">
                  <span className="w-24">{w.date}</span><span>{w.tMin}–{w.tMax} °C</span><span>{w.rhMean}% RH</span>{w.precipProb !== null && <span>rain {w.precipProb}%</span>}<StatusBadge status={w.source === "forecast" ? "forecast" : "assumed"} />
                </div>
              ))}
            </div>
            <div>
              <div className="label">Destination climate (for storage)</div>
              <div>{j.destinationClimate.tMean} °C mean, {j.destinationClimate.rhMean}% RH <StatusBadge status="assumed" /></div>
              <div className="text-xs text-ink-3">{j.destinationClimate.note}</div>
            </div>
            {j.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
            <Notice tone="info">Outdoor weather does not establish the temperature or humidity inside a vehicle or package. PackWise labels in-vehicle values as assumptions; live monitoring needs sensors.</Notice>
          </div>
        )}
      </Card>
    </div>
  );
}

function EvidenceStep({ d, up }: StepProps) {
  const c = getCommodity(d.commodityId!);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [extract, setExtract] = useState<any>(null);
  const onReport = async (f: File) => {
    setAiBusy(true); setAiErr(null); setExtract(null);
    const fd = new FormData(); fd.append("report", f);
    try {
      const r = await fetch("/api/ai/extract", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setExtract(j);
    } catch (e) { setAiErr((e as Error).message); } finally { setAiBusy(false); }
  };
  const applyExtracted = (v: any) => {
    const ev: Evidenced = { value: v.value, unit: v.unit, status: "reported", date: extract?.reportDate, note: `${extract?.labOrIssuer ?? "report"} — ${v.method}` };
    if (v.property === "moisture_wb") up({ moisture: ev });
    else if (v.property === "ph") up({ measurements: { ...d.measurements, ph: ev } });
    else if (v.property === "salt") up({ measurements: { ...d.measurements, salt: ev } });
    else if (v.property === "respiration_rate") up({ rco2: ev });
  };
  const setM = (key: string, v: string, unit: string) => {
    const m = { ...d.measurements };
    if (v === "") delete m[key]; else m[key] = { value: +v, unit, status: "measured", date: today() };
    up({ measurements: m });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Technical information">
        <p className="muted mb-3">You do not have to calculate every property. PackWise uses reference ranges where appropriate and tells you when a measurement would change the decision.</p>
        <div className="space-y-4">
          {c.moisture && (
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Initial moisture (% wet basis)</span><StatusBadge status={d.moisture?.status ?? "reference"} /></div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" type="number" step="0.1" placeholder={`Reference ${c.moisture.initialWb.value}%`} value={d.moisture?.value ?? ""}
                  onChange={(e) => up({ moisture: e.target.value === "" ? undefined : { value: +e.target.value, lo: +e.target.value - 0.3, hi: +e.target.value + 0.3, unit: "% w.b.", status: d.moisture?.status === "reported" ? "reported" : "measured", date: today() } })} />
                <select className="input" value={d.moisture?.status ?? "reference"} disabled={!d.moisture} onChange={(e) => d.moisture && up({ moisture: { ...d.moisture, status: e.target.value as any } })}>
                  <option value="measured">Measured</option><option value="reported">Supplier/lab reported</option>
                </select>
              </div>
              <p className="mt-1 text-xs text-ink-3">Leave blank to use the reference range {c.moisture.initialWb.lo}–{c.moisture.initialWb.hi}% (wider uncertainty).</p>
            </div>
          )}
          {c.respiration && (
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Respiration at 20 °C (mg CO₂/kg·h)</span><StatusBadge status={d.rco2?.status ?? "reference"} /></div>
              <input className="input" type="number" placeholder={`Reference ${c.respiration.rco2At20.lo}–${c.respiration.rco2At20.hi}`} value={d.rco2?.value ?? ""}
                onChange={(e) => up({ rco2: e.target.value === "" ? undefined : { value: +e.target.value, lo: +e.target.value * 0.85, hi: +e.target.value * 1.15, unit: "mg CO₂/kg·h", status: "measured", date: today() } })} />
              <p className="mt-1 text-xs text-ink-3">A closed-jar test narrows the micro-perforation range (see Library K14).</p>
            </div>
          )}
          {c.requiredMeasurements?.map((m) => (
            <div key={m.key} className="rounded-xl border border-line p-3">
              <div className="mb-1 flex items-center justify-between"><span className="font-semibold">{m.label}</span><StatusBadge status={d.measurements[m.key]?.status ?? "unknown"} /></div>
              <input className="input" type="number" step="any" placeholder={m.key === "oilCover" ? "1 = yes, 0 = no" : m.key === "micro" ? "Measured shelf life in days at ≤ 4 °C" : "Measured value"} value={d.measurements[m.key]?.value ?? ""} onChange={(e) => setM(m.key, e.target.value, m.key === "ph" ? "pH" : m.key === "micro" ? "days" : m.key === "salt" ? "%" : "")} />
              <p className="mt-1 text-xs text-ink-2">{m.why}</p>
              <p className="text-xs text-ink-3">How: {m.howToMeasure}</p>
            </div>
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        <Card title="Use a test report or supplier specification">
          <input type="file" accept="application/pdf,image/*" className="input" onChange={(e) => e.target.files?.[0] && onReport(e.target.files[0])} />
          {aiBusy && <div className="mt-2"><Spinner label="Reading the report…" /></div>}
          <ErrorBox error={aiErr} />
          {extract && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="text-xs text-ink-2">{extract.documentType} · {extract.labOrIssuer} · {extract.reportDate} · sample: {extract.sampleDescription}</div>
              {extract.values.map((v: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1.5">
                  <span><strong>{v.property}</strong>: {v.value} {v.unit} <span className="text-xs text-ink-3">({v.method}{v.testConditions ? `, ${v.testConditions}` : ""})</span></span>
                  {["moisture_wb", "ph", "salt", "respiration_rate"].includes(v.property) && <button className="btn-ghost btn-sm" onClick={() => applyExtracted(v)}>Use</button>}
                </div>
              ))}
              {extract.warnings.map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}
              <p className="text-xs text-ink-3">Check that the report applies to this batch before using its values.</p>
            </div>
          )}
          {!extract && !aiBusy && <p className="mt-2 text-xs text-ink-3">AI extracts values, units, method and date; you confirm each value. Without AI, type the values on the left.</p>}
        </Card>
        <Card title="Sealing equipment you own">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["heat-impulse", "band-sealer", "vacuum-chamber", "vacuum-gas-flush", "tray-sealer", "can-seamer", "sack-stitch"] as SealMethod[]).map((m) => (
              <label key={m} className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <input type="checkbox" className="mt-0.5" checked={d.equipment.includes(m)} onChange={(e) => up({ equipment: e.target.checked ? [...d.equipment, m] : d.equipment.filter((x) => x !== m) })} />
                <span><span className="font-semibold">{EQUIPMENT[m].label}</span><span className="block text-xs text-ink-3">{EQUIPMENT[m].note}</span></span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">If you lack a machine, PackWise considers matching packing services and never recommends a pack you cannot close properly.</p>
        </Card>
      </div>
    </div>
  );
}

function ReviewStep({ d }: { d: Draft }) {
  const c = getCommodity(d.commodityId!);
  return (
    <Card title="Review">
      <div className="grid gap-4 text-sm md:grid-cols-3">
        <div><div className="label">Food</div>{foodImage(c.id) && <img src={foodImage(c.id)!} alt="" className="mb-1 h-16 w-16 rounded-lg object-cover" />} {c.name} — {d.state} <span className="text-xs text-ink-3">({d.identification.method === "photo-ai" ? "photo + confirmed" : "selected"})</span></div>
        <div><div className="label">Journey</div>{d.journey?.origin.name} → {d.journey?.destination.name}<br />{d.departureDate} · {d.journey?.distanceKm} km</div>
        <div><div className="label">Equipment</div>{d.equipment.map((m) => EQUIPMENT[m].label).join(", ") || "none"}</div>
      </div>
      <table className="table-clean mt-4">
        <thead><tr><th>Portion</th><th>kg</th><th>Use</th><th>Storage</th><th>Pack size</th></tr></thead>
        <tbody>{d.portions.map((p) => <tr key={p.id}><td>{p.label}</td><td>{p.kg}</td><td>{p.use}</td><td>{p.storageDays} days, {p.storage.type}</td><td>{p.packSizeKg ? `${p.packSizeKg} kg` : "compare"}</td></tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-ink-3">Calculations run on this device if you are offline or not signed in; sign in to save the result and continue to sourcing, packing and batch QR.</p>
    </Card>
  );
}

export { COMMODITIES };
