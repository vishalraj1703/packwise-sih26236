import { useEffect, useState } from "react";
import { COMMODITIES } from "../../shared/data/commodities";
import { MATERIALS, STRUCTURES } from "../../shared/data/materials";
import { SOURCES } from "../../shared/data/sources";
import { structureAtTest, recyclability, describeLayers } from "../../shared/engine/barrier";
import { OXIDATION_THRESHOLD_DAYS, DELAY_SCENARIO, ENGINE_VERSION } from "../../shared/engine/recommend";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sig, dateStr } from "../lib/format";
import { Card, Disclosure, ErrorBox, StatusBadge, SourceRef, Field, Notice } from "../components/ui";
import { FAMILIAR_EXAMPLES, EXAMPLE_DISCLAIMER } from "../../shared/data/examples";
import { PLAIN_NAMES } from "../../shared/data/materials";
import { loadVerifiedExamples, type VerifiedExample } from "../components/RealLifeExamples";

const GAPS = [
  {
    n: 1, title: "Oxygen and moisture protection — required OTR/WVTR",
    method: [
      "Moisture (dry foods): linear sorption isotherm M = a + b·aw (dry basis). With constant conditions, M(t) = Me − (Me − M0)·e^(−k·t), where k = P′·A·p₀(T)/(Ws·b) and Me = a + b·RH. Applied piecewise over transit and storage segments.",
      "Required permeance: bisection on WVTR at the standard 38 °C/90 % RH test condition (translated to storage temperature with a generic Ea of 45 kJ/mol) so that moisture reaches Mc exactly at the end of the target period.",
      "Oxygen: tolerable O₂ gain (mg/kg, class tolerance) × food mass = budget. Available oxygen = residual headspace O₂ + Σ OTR(T)·A·0.209 atm·days·1.429 mg/cc. Required OTR (23 °C/0 % RH) = budget ÷ exposure-weighted ingress per unit OTR.",
      "Uncertainty: triangular sampling of initial/critical moisture, isotherm parameters and film variability (±10 % third-party report, ±15 % declared, ±25 % undocumented) → P10 (cautious) and P50 days to limit."
    ],
    assumptions: [`Oxidation of available O₂ is treated as decision-critical only beyond ${OXIDATION_THRESHOLD_DAYS} days of total exposure (open parameter pending expert review).`, "N₂ flushing leaves ≤ 2 % O₂ (verify with a headspace analyser); vacuum leaves ~3 % of pack volume.", "Isotherm linear within the stated aw range; outside it the result is flagged as an extrapolation.", "Seal areas (~10 % of film) do not transmit."],
    sources: ["LABUZA", "SALAME", "BUCK", "ASTM-D3985", "ASTM-F1249"]
  },
  {
    n: 2, title: "Structure and thickness",
    method: [
      "Each layer: T_i = T_ref·(L_ref/L_i) for polymers; coatings, metallisation and foil are fixed (not thickness-scaled). Temperature via Arrhenius with material Ea; humidity-sensitive layers (EVOH, nylon, cellulose) interpolated between dry and humid OTR at the estimated in-laminate RH.",
      "Laminate: series resistance 1/T_total = Σ 1/T_i (O₂, CO₂ and water vapour).",
      "Matching: candidate commercially available structures × sizes × oxygen-control options are evaluated with the supplier's documented values when a test report or declaration exists (scaled relative to generic values), otherwise generic values with a 'request test report' condition.",
      "Minimum single-material gauge = T_ref·L_ref / T_required, rounded up to common gauges (20–200 µm); impractical gauges are reported as such."
    ],
    assumptions: ["Generic barrier values are literature-typical; a purchase always relies on the supplier's own test report.", "Pouch geometry from the pillow-pouch volume approximation with 15 % fill allowance."],
    sources: ["POLYMER-HANDBOOK"]
  },
  {
    n: 3, title: "MAP and micro-perforation",
    method: [
      "Respiration R_O₂(y,T) = R_air(20 °C)·Q10^((T−20)/10)·(y/(Km+y))·((Km+0.209)/0.209); RQ links CO₂ production.",
      "Steady state per gas: (OTR·A + n·K_hole)·(y_out − y_in) = R·W. Per-hole conductance K = D·πr²/(L + r)·273.15/T (Fishman end-correction), D_O₂ = 0.20, D_CO₂ = 0.16 cm²/s at 20 °C, ∝ T^1.75.",
      "Design: hole count so O₂ sits mid-window at storage temperature; smallest standard diameter giving ≤ 60 holes. Equilibrium re-checked for every journey segment (hot transit → anaerobic risk).",
      "Monte Carlo (400 runs): respiration, Q10, RQ, Km, film ±15 %, hole ±10 %, storage ±2 °C → probability in window, anaerobic and CO₂-injury risk; transient headspace simulated from air (0.5 h steps)."
    ],
    assumptions: ["No CO₂ inhibition of respiration (conservative for O₂).", "Relative-rate storage-life estimate uses reference optimum-temperature life; it is not a shelf-life claim."],
    sources: ["KADER", "USDA-HB66", "FISHMAN", "GUILLARD"]
  },
  {
    n: 4, title: "Sealing and mechanical performance",
    method: [
      "Equipment compatibility: a pack is only offered if it can be closed by owned equipment (sealant range inside machine range, vacuum/gas flush where the oxygen strategy needs it) or by a matched packing service.",
      "Seal specification: ASTM F88 peel ≥ 10/15/20 N per 15 mm (≤0.5 kg / ≤2 kg / larger), ASTM F2096 bubble leak, ASTM F1140 burst for MAP/vacuum/≥2 kg, visual criteria; seal width by pack size and sealer.",
      "Sampling: zero-acceptance plan n = ln(1−C)/ln(1−p) (95 % confidence, ≤ 5 % defective → 59 packs).",
      "Secondary pack: McKee BCT = 5.874·ECT·√(caliper·perimeter) vs stacking load × (time × humidity × pattern × handling) derating; board grade chosen; ISTA 1A drop height by gross weight; puncture index for vacuum/sharp contents."
    ],
    assumptions: ["Numerical acceptance limits are proposed defaults awaiting expert confirmation.", "Derating factors are commonly cited rules of thumb."],
    sources: ["ASTM-F88", "ASTM-F2096", "ASTM-F1140", "ISO-2859", "MCKEE", "ISTA-1A"]
  },
  {
    n: 5, title: "Validation and benefit claims",
    method: [
      "Trial & Verify: control vs recommended pack under the same conditions; outcomes, minimum meaningful differences and primary outcome set before data entry and locked with a fingerprint (FNV-1a hash of the plan).",
      "Sample size: two-mean or two-proportion formulas (α 0.05, power 0.8).",
      "Analysis: Welch t-test and 95 % CI for measurements; Newcombe (Wilson) CI for proportions. Decision uses the CI against the locked threshold: meets / inconclusive / does not meet.",
      "Claims are generated only from locked trials and carry their conditions; predictions are compared with observations (bias, MAE) for model evaluation. Q10 accelerated-test helpers are provided with extrapolation warnings.",
      "Sustainability: material mass per kg food, PWM category and indicative cradle-to-gate CO₂e ranges — compared only among technically suitable packs."
    ],
    assumptions: ["One successful trial does not establish a universal shelf-life claim.", "CO₂e factors are indicative ranges, not an LCA."],
    sources: ["PWM-2022"]
  }
];

const COVERAGE = [
  ["Food properties and environmental conditions", "Guided inputs with status, report extraction, reference ranges, route/weather (OSRM, Open-Meteo) and storage questions."],
  ["Material recommendations", "Compatibility filtering and order-level ranking across plastics, laminates, rigid, breathable and compostable options."],
  ["OTR and WVTR requirements", "Derived per portion from sorption and oxygen-budget models over the full exposure profile (Gap 1)."],
  ["Structure and thickness", "Series-resistance laminate model, documented supplier matching, minimum gauges (Gap 2)."],
  ["Sealability and mechanical strength", "Equipment compatibility, seal spec with ASTM tests, sampling, McKee cartons, drop heights (Gap 4)."],
  ["Gas permeability, MAP and micro-perforation", "Respiration-aware steady-state + transient model with Monte Carlo risk (Gap 3)."],
  ["Sustainable/recyclable alternatives", "Recyclability class, PWM category, material mass and indicative CO₂e after suitability screening."],
  ["Shelf-life prediction and loss reduction", "Conditional P10/P50 estimates; Trial & Verify with pre-registered thresholds (Gap 5)."],
  ["Cost optimisation and QR traceability", "Order-level cost with MOQ/setup sharing; batch QR, events, split/repack, simulated POS, issues, lot tracing."],
  ["Usable decision-support platform", "Simple wizard, Tamil/Hindi, pictorial spoken guide, offline PWA with local engine, library and calculators."]
];

export default function Evidence() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const load = () => api<any[]>("/reviews").then(setReviews).catch(() => undefined);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 100); }, []);
  const latest = (entity: string, id: string) => reviews.find((r) => r.entity === entity && r.entity_id === id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Methods & data</h1>
        <p className="muted max-w-3xl">Every recommendation follows: check inputs → identify protection needs → exclude incompatible options → match documented materials → evaluate supported performance → compare feasible costs and trade-offs → explain. The language model never supplies OTR, WVTR, film thickness, gas mixtures or expiry dates. Engine: {ENGINE_VERSION}.</p>
      </div>
      <div className="space-y-3">
        {GAPS.map((g) => (
          <Disclosure key={g.n} defaultOpen={g.n === 1} summary={<span><span className="mr-2 text-brand-2">GAP {g.n}</span>{g.title}</span>}>
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div><div className="label">Method</div><ul className="list-disc space-y-1.5 pl-5 text-sm">{g.method.map((m) => <li key={m}>{m}</li>)}</ul></div>
              <div>
                <div className="label">Assumptions & open parameters</div><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{g.assumptions.map((m) => <li key={m}>{m}</li>)}</ul>
                <div className="label mt-3">Sources</div><div className="flex flex-wrap gap-1">{g.sources.map((s) => <SourceRef key={s} id={s} />)}</div>
              </div>
            </div>
          </Disclosure>
        ))}
      </div>
      <p className="text-xs text-ink-3">Delay-tolerance scenario: transit +{DELAY_SCENARIO.extraHours} h at +{DELAY_SCENARIO.extraC} °C with film variability +15 %.</p>

      <Card title="Commodity reference data">
        <div className="overflow-x-auto">
          <table className="table-clean">
            <thead><tr><th>Food</th><th>Key parameters</th><th>Status</th><th>Expert review</th></tr></thead>
            <tbody>{COMMODITIES.map((c) => {
              const rv = latest("commodity", c.id);
              return (
                <tr key={c.id}>
                  <td className="font-semibold">{c.icon} {c.name}<div className="text-xs font-normal text-ink-3">{c.foodClass}</div></td>
                  <td className="text-xs">
                    {c.moisture && <div>Moisture {c.moisture.initialWb.lo}–{c.moisture.initialWb.hi}% → limit {c.moisture.criticalWb.value}% <SourceRef id={c.moisture.criticalWb.sourceId} />; isotherm b {c.moisture.isoB.lo}–{c.moisture.isoB.hi} <SourceRef id={c.moisture.isoB.sourceId} /></div>}
                    {c.oxygen && <div>O₂ tolerance {c.oxygen.tolerancePpm.lo}–{c.oxygen.tolerancePpm.hi} mg/kg <SourceRef id={c.oxygen.tolerancePpm.sourceId} /></div>}
                    {c.respiration && <div>R₂₀ {c.respiration.rco2At20.lo}–{c.respiration.rco2At20.hi} mg CO₂/kg·h <SourceRef id={c.respiration.rco2At20.sourceId} />; O₂ {c.respiration.targetO2.map((x) => x * 100).join("–")}%, CO₂ {c.respiration.targetCo2.map((x) => x * 100).join("–")}% <SourceRef id={c.respiration.sourceIdGas} /></div>}
                    {c.requiredMeasurements && <div>Requires measurement: {c.requiredMeasurements.map((m) => m.label).join(", ")}</div>}
                  </td>
                  <td><StatusBadge status="reference" /></td>
                  <td className="text-xs">{rv ? <span className={rv.decision === "approved" ? "text-good" : "text-warn"}>{rv.decision} by {rv.reviewer} · {dateStr(rv.created_at)}{rv.notes && ` — ${rv.notes}`}</span> : "pending"}{user?.role === "expert" && <ReviewButtons entity="commodity" id={c.id} onDone={load} />}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Packaging structures (generic values at standard test conditions)">
        <div className="overflow-x-auto">
          <table className="table-clean">
            <thead><tr><th>Structure</th><th>Layers</th><th className="text-right">OTR</th><th className="text-right">WVTR</th><th>End of life</th></tr></thead>
            <tbody>{STRUCTURES.map((s) => { const at = structureAtTest(s); const r = recyclability(s); return (
              <tr key={s.id}><td className="font-semibold">{s.name}</td><td className="text-xs">{s.rigid ? "rigid container" : describeLayers(s)}</td><td className="text-right">{Number.isNaN(at.otr) ? "per pack" : sig(at.otr)}</td><td className="text-right">{Number.isNaN(at.wvtr) ? "per pack" : sig(at.wvtr)}</td><td className="text-xs">{r.label}<div className="text-ink-3">{r.pwmCategory}</div></td></tr>
            ); })}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">OTR cc/m²·day·atm at 23 °C, 0 % RH; WVTR g/m²·day at 38 °C, 90 % RH. Materials: {Object.values(MATERIALS).map((m) => m.commonName).join(", ")}.</p>
      </Card>

      <ExamplesSection canEdit={user?.role === "expert" || user?.role === "admin"} />

      <Card title="Coverage of Problem Statement 26236">
        <table className="table-clean"><thead><tr><th>Requirement</th><th>Implementation in this prototype</th></tr></thead>
          <tbody>{COVERAGE.map(([a, b]) => <tr key={a}><td className="font-semibold">{a}</td><td>{b}</td></tr>)}</tbody></table>
        <p className="mt-2 text-sm text-ink-2">Implemented ≠ validated: numerical accuracy, expert agreement and real-world benefit still have to be demonstrated through technical review, usability tests and trials. Supplier, price, transport and billing data are simulated. We do not claim this combination is unique or that it outperforms existing services (e.g. Packarma, TAILORPACK, IIP, Packitoo HIPE, NexPak), whose different scope is not a defect.</p>
      </Card>

      <Card title="Sources">
        <ul className="space-y-2 text-sm">{Object.values(SOURCES).map((s) => (
          <li key={s.id} id={`src-${s.id}`} className="scroll-mt-24 rounded-xl border border-line p-2">
            <span className="chip mr-2 bg-surface">{s.id}</span><strong>{s.title}</strong> — {s.publisher}{s.year && ` (${s.year})`} {s.url && <a className="text-brand underline" href={s.url} target="_blank" rel="noreferrer">link</a>}
            {s.note && <div className="text-xs text-ink-2">{s.note}</div>}
          </li>
        ))}</ul>
      </Card>

      <Card title="Plain-language glossary">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {[["OTR / WVTR", "How quickly oxygen / water vapour passes through packaging, with units and test conditions."], ["MAP", "Modified Atmosphere Packaging: managing the gas mixture around the food inside its pack."], ["Structure / laminate", "The material layers that together make up the packaging."], ["Batch / material lot", "A defined group of food units / a traceable production lot of packaging material."], ["MOQ / POS", "Minimum order quantity / point-of-sale billing system."], ["Shelf-life target / estimate", "How long you want the food to last / a conditional prediction supported by evidence."], ["P10 / P50", "Cautious (only 10 % of cases worse) / typical estimate from varying uncertain inputs."], ["Water activity (aw)", "How available the water in food is; controls microbial growth and texture."]].map(([a, b]) => (
            <div key={a} className="rounded-xl bg-surface p-2"><dt className="font-semibold">{a}</dt><dd className="text-ink-2">{b}</dd></div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function ReviewButtons({ entity, id, onDone }: { entity: string; id: string; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const act = async (decision: string) => {
    const notes = prompt(`Notes for ${decision}:`) ?? "";
    try { await api("/reviews", { json: { entity, entityId: id, decision, notes } }); onDone(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="mt-1 flex gap-1">
      <button className="btn-ghost btn-sm" onClick={() => act("approved")}>Approve</button>
      <button className="btn-ghost btn-sm" onClick={() => act("needs-change")}>Needs change</button>
      <ErrorBox error={err} />
    </div>
  );
}

function ExamplesSection({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<VerifiedExample[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => loadVerifiedExamples(true).then(setList);
  useEffect(() => { load(); }, []);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setErr(null); setMsg(null);
    const form = e.currentTarget;
    const r = await fetch("/api/examples", { method: "POST", body: new FormData(form) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error + (j.details ? `: ${j.details.join("; ")}` : "")); return; }
    form.reset(); setMsg("Verified example added."); load();
  };
  const remove = async (id: number) => { await fetch(`/api/examples/${id}`, { method: "DELETE" }); load(); };
  return (
    <Card title="Real-life packaging examples">
      <p className="muted mb-3">Users trust what they have seen in shops. Two kinds of examples are shown next to each recommendation:</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-good-bg/50 p-3 text-sm"><strong>✓ Verified examples</strong> — added by a reviewer with a product photo, the documented material structure and its source, the shelf life printed on the label, and the date checked. {list.length} so far.</div>
        <div className="rounded-xl bg-surface p-3 text-sm"><strong>Format examples</strong> — {FAMILIAR_EXAMPLES.length} well-known product types described only by what is visible on the shelf. {EXAMPLE_DISCLAIMER}</div>
      </div>
      {list.length > 0 && (
        <table className="table-clean mt-3"><thead><tr><th>Product</th><th>Matches</th><th>Documented structure</th><th>Checked</th><th /></tr></thead>
          <tbody>{list.map((v) => <tr key={v.id}><td><img src={v.photo_path} alt="" className="mr-2 inline h-10 w-10 rounded object-cover" />{v.brand} — {v.product}</td><td className="text-xs">{PLAIN_NAMES[v.structure_id]}</td><td className="text-xs">{v.documented_structure}<div className="text-ink-3">{v.structure_source}</div></td><td className="text-xs">{v.source_date}</td><td>{canEdit && <button className="btn-ghost btn-sm" onClick={() => remove(v.id)}>Remove</button>}</td></tr>)}</tbody></table>
      )}
      {canEdit ? (
        <form className="mt-4 grid gap-3 rounded-xl border border-line p-3 md:grid-cols-2" onSubmit={submit}>
          <div className="md:col-span-2 font-semibold">Add a verified example (reviewer)</div>
          <Field label="Brand"><input name="brand" className="input" required /></Field>
          <Field label="Product"><input name="product" className="input" required placeholder="e.g. instant noodles 70 g" /></Field>
          <Field label="Matches PackWise pack type"><select name="structureId" className="input">{Object.entries(PLAIN_NAMES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field>
          <Field label="For food (optional)"><select name="commodityId" className="input"><option value="">any</option>{COMMODITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Documented material structure"><input name="documentedStructure" className="input" required placeholder="e.g. PET 12 / met-PET 12 / PE 50" /></Field>
          <Field label="Where the structure is documented" hint="Manufacturer specification, supplier datasheet or lab report — not appearance"><input name="structureSource" className="input" required /></Field>
          <Field label="Shelf life printed on label (optional)"><input name="labelledShelfLife" className="input" placeholder="e.g. Best before 9 months from manufacture" /></Field>
          <Field label="Storage instructions on label (optional)"><input name="storageInstructions" className="input" /></Field>
          <Field label="Product photo" hint="Your own photo, or one you have the right to use"><input name="photo" type="file" accept="image/*" className="input" required /></Field>
          <Field label="Photo source / rights"><input name="photoSource" className="input" required placeholder="e.g. photographed by reviewer, 1 Oct 2026" /></Field>
          <Field label="Date checked"><input name="sourceDate" type="date" className="input" required /></Field>
          <div className="flex items-end"><button className="btn-primary">Add verified example</button></div>
          <div className="md:col-span-2"><ErrorBox error={err} />{msg && <Notice tone="good">{msg}</Notice>}</div>
        </form>
      ) : <p className="mt-3 text-xs text-ink-3">Reviewer accounts can add verified examples here.</p>}
    </Card>
  );
}
