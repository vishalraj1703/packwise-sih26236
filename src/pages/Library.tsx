import { useMemo, useState } from "react";
import { ARTICLES, LIBRARY_UPDATED } from "../../shared/data/knowledge";
import { SOURCES } from "../../shared/data/sources";
import { MATERIALS } from "../../shared/data/materials";
import { search } from "../../shared/engine/retrieval";
import { holeConductance, respirationO2 } from "../../shared/engine/map";
import { mckeeBct, stackingSafetyFactor, BOARD_GRADES, istaDropHeightCm, zeroAcceptanceSample } from "../../shared/engine/sealing";
import { psat, arrhenius } from "../../shared/engine/physics";
import { DP_WVTR_TEST } from "../../shared/engine/barrier";
import { sig } from "../lib/format";
import { Card, Field, Tabs } from "../components/ui";

type Calc = "barrier" | "map" | "carton" | "sampling";

export default function Library() {
  const [q, setQ] = useState("");
  const [calc, setCalc] = useState<Calc>("barrier");
  const hits = useMemo(() => (q.trim() ? search(q, 10).map((h) => h.article) : ARTICLES), [q]);
  return (
    <div className="space-y-5">
      <h1 className="h1">Library & calculators</h1>
      <p className="muted">Everything on this page works offline once the app has been opened. Library updated {LIBRARY_UPDATED}; articles are drafts pending expert review.</p>
      <Card title="Calculators" action={<Tabs tabs={[{ id: "barrier", label: "Film barrier" }, { id: "map", label: "Perforations" }, { id: "carton", label: "Carton stacking" }, { id: "sampling", label: "Sampling" }]} value={calc} onChange={setCalc} />}>
        {calc === "barrier" && <BarrierCalc />}
        {calc === "map" && <PerfCalc />}
        {calc === "carton" && <CartonCalc />}
        {calc === "sampling" && <SamplingCalc />}
      </Card>
      <Card title="Packaging library">
        <input className="input mb-3" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid gap-3 md:grid-cols-2">
          {hits.map((a) => (
            <article key={a.id} className="rounded-xl border border-line p-3">
              <div className="text-xs font-bold text-brand-2">{a.id}</div>
              <h3 className="font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{a.text}</p>
              <p className="mt-2 text-xs text-ink-3">Sources: {a.sources.map((s) => SOURCES[s]?.title ?? s).join("; ")}</p>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BarrierCalc() {
  const [mat, setMat] = useState("LDPE");
  const [thk, setThk] = useState(50);
  const [t, setT] = useState(30);
  const [rh, setRh] = useState(75);
  const [area, setArea] = useState(0.1);
  const m = MATERIALS[mat];
  const f = m.thicknessScalable ? m.refThicknessUm / thk : 1;
  const otr = m.otrRef * f, wvtr = m.wvtrRef * f;
  const otrT = otr * arrhenius(m.ePermO2kJ, 23, t);
  const perm = (wvtr / DP_WVTR_TEST) * arrhenius(m.ePermH2OkJ, 38, t);
  const waterPerDay = perm * area * psat(t) * (rh / 100);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Material"><select className="input" value={mat} onChange={(e) => setMat(e.target.value)}>{Object.values(MATERIALS).map((x) => <option key={x.id} value={x.id}>{x.commonName}</option>)}</select></Field>
        <Field label="Thickness (micron)"><input className="input" type="number" value={thk} onChange={(e) => setThk(+e.target.value)} disabled={!m.thicknessScalable} /></Field>
        <Field label="Storage °C"><input className="input" type="number" value={t} onChange={(e) => setT(+e.target.value)} /></Field>
        <Field label="Outside RH %"><input className="input" type="number" value={rh} onChange={(e) => setRh(+e.target.value)} /></Field>
        <Field label="Pack area m²"><input className="input" type="number" step="0.01" value={area} onChange={(e) => setArea(+e.target.value)} /></Field>
      </div>
      <div className="space-y-1 text-sm">
        <div>OTR at 23 °C, 0% RH: <strong>{sig(otr)}</strong> cc/m²·day</div>
        <div>WVTR at 38 °C / 90% RH: <strong>{sig(wvtr)}</strong> g/m²·day</div>
        <div>OTR at {t} °C: <strong>{sig(otrT)}</strong> cc/m²·day (Arrhenius, Ea {m.ePermO2kJ} kJ/mol)</div>
        <div>Water entering a dry food pack at {t} °C/{rh}% RH: ≈<strong>{sig(waterPerDay)}</strong> g/day (worst case, dry contents)</div>
        <p className="text-xs text-ink-3">Generic literature values ({m.thicknessScalable ? "scaled inversely with thickness" : "coating/foil — not thickness-scaled"}). Match a real film on its supplier test report.</p>
      </div>
    </div>
  );
}

function PerfCalc() {
  const [d, setD] = useState(90);
  const [film, setFilm] = useState(30);
  const [t, setT] = useState(13);
  const [r20, setR20] = useState(25);
  const [q10, setQ10] = useState(2.3);
  const [kgFill, setKg] = useState(1);
  const [target, setTarget] = useState(4);
  const k = holeConductance(d, film, t, "O2");
  const need = (respirationO2(target / 100, t, { rco2At20: r20, q10, rq: 1, km: 0.03 }) * kgFill) / (0.209 - target / 100);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Hole diameter (micron)"><input className="input" type="number" value={d} onChange={(e) => setD(+e.target.value)} /></Field>
        <Field label="Film thickness (micron)"><input className="input" type="number" value={film} onChange={(e) => setFilm(+e.target.value)} /></Field>
        <Field label="Temperature °C"><input className="input" type="number" value={t} onChange={(e) => setT(+e.target.value)} /></Field>
        <Field label="Respiration @20 °C mg CO₂/kg·h"><input className="input" type="number" value={r20} onChange={(e) => setR20(+e.target.value)} /></Field>
        <Field label="Q10"><input className="input" type="number" step="0.1" value={q10} onChange={(e) => setQ10(+e.target.value)} /></Field>
        <Field label="Fill kg"><input className="input" type="number" step="0.1" value={kgFill} onChange={(e) => setKg(+e.target.value)} /></Field>
        <Field label="Target O₂ %"><input className="input" type="number" step="0.5" value={target} onChange={(e) => setTarget(+e.target.value)} /></Field>
      </div>
      <div className="space-y-1 text-sm">
        <div>One {d} µm hole passes ≈<strong>{sig(k)}</strong> mL O₂/day·atm (Fishman diffusion + end correction).</div>
        <div>Pack needs ≈<strong>{sig(need)}</strong> mL/day·atm total O₂ conductance at {target}% O₂.</div>
        <div>→ ≈<strong>{Math.max(0, Math.round(need / k))}</strong> holes if the film itself passes little oxygen (subtract the film's own OTR × area).</div>
        <p className="text-xs text-ink-3">For a full design with film permeation, temperature profile and Monte Carlo risk, run an assessment.</p>
      </div>
    </div>
  );
}

function CartonCalc() {
  const [grade, setGrade] = useState("5ply");
  const [l, setL] = useState(40), [w, setW] = useState(30), [h, setH] = useState(25);
  const [gross, setGross] = useState(15);
  const [stackM, setStackM] = useState(1.5);
  const [daysS, setDays] = useState(30);
  const [rh, setRh] = useState(80);
  const g = BOARD_GRADES.find((x) => x.id === grade)!;
  const bct = mckeeBct(g.ectNPerM, g.caliperMm, (2 * (l + w)) / 100);
  const layers = Math.floor((stackM * 100) / h);
  const sf = stackingSafetyFactor(daysS, rh, true);
  const req = (layers - 1) * gross * 9.81 * sf.safetyFactor;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Board"><select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>{BOARD_GRADES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="L cm"><input className="input" type="number" value={l} onChange={(e) => setL(+e.target.value)} /></Field>
        <Field label="W cm"><input className="input" type="number" value={w} onChange={(e) => setW(+e.target.value)} /></Field>
        <Field label="H cm"><input className="input" type="number" value={h} onChange={(e) => setH(+e.target.value)} /></Field>
        <Field label="Gross kg"><input className="input" type="number" value={gross} onChange={(e) => setGross(+e.target.value)} /></Field>
        <Field label="Stack height m"><input className="input" type="number" step="0.1" value={stackM} onChange={(e) => setStackM(+e.target.value)} /></Field>
        <Field label="Storage days"><input className="input" type="number" value={daysS} onChange={(e) => setDays(+e.target.value)} /></Field>
        <Field label="RH %"><input className="input" type="number" value={rh} onChange={(e) => setRh(+e.target.value)} /></Field>
      </div>
      <div className="space-y-1 text-sm">
        <div>Estimated box compression (McKee): <strong>{Math.round(bct)} N</strong></div>
        <div>{layers} layers → load on bottom box {Math.round((layers - 1) * gross * 9.81)} N × safety factor {sf.safetyFactor.toFixed(1)} = <strong>{Math.round(req)} N</strong> required</div>
        <div className={bct >= req ? "font-semibold text-good" : "font-semibold text-bad"}>{bct >= req ? "✓ Board is adequate" : "✕ Choose stronger board or stack lower"}</div>
        <div>Drop-test height for {gross} kg: {istaDropHeightCm(gross)} cm (ISTA 1A class)</div>
        <p className="text-xs text-ink-3">Derating factors are commonly cited rules of thumb (reference estimates).</p>
      </div>
    </div>
  );
}

function SamplingCalc() {
  const [lot, setLot] = useState(500);
  const [conf, setConf] = useState(95);
  const [p, setP] = useState(5);
  const n = zeroAcceptanceSample(lot, conf / 100, p / 100);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Packs in lot"><input className="input" type="number" value={lot} onChange={(e) => setLot(+e.target.value)} /></Field>
        <Field label="Confidence %"><input className="input" type="number" value={conf} onChange={(e) => setConf(+e.target.value)} /></Field>
        <Field label="Max defect %"><input className="input" type="number" step="0.5" value={p} onChange={(e) => setP(+e.target.value)} /></Field>
      </div>
      <div className="text-sm">Test <strong>{n}</strong> packs; accept only if none fails (c = 0). This demonstrates with {conf}% confidence that no more than {p}% of packs are defective.</div>
    </div>
  );
}
