# PackWise — AI-assisted, evidence-backed food packaging advisor

Smart India Hackathon · Problem Statement **26236** — *AI-Based Intelligent Food Packaging Material Recommendation System for Food Commodities*.

PackWise helps farmers, startups and small food industries choose suitable packaging for their food, storage needs, transport journey and budget. It explains how to pack, finds matching suppliers, and traces each packed batch through delivery, shop billing and consumer feedback. Every recommendation shows **why it fits, what evidence supports it, what conditions it requires and what still needs checking.**

---

## Quick start

Requirements: **Node.js 24+** (uses the built-in `node:sqlite`). No native modules and no external database.

```bash
npm install
npm run dev          # API on :8787 + web on http://localhost:5173
```

Other commands:

```bash
npm test             # 26 engine tests (physics, the five gaps, recommendation sequence, retrieval)
npm run build        # type-check + production build (PWA with offline precache)
npm start            # production server: API + built app on PORT (default 8787)
npm run seed         # reset the database to the demo dataset
```

Copy `.env.example` to `.env` (or set the variables in your shell):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Optional. Enables photo identification, report extraction and the online explainer (Claude). Without it, the app uses manual selection and entry, and the offline assistant. |
| `PACKWISE_DEMO_PASSWORD` | Password for the seeded demo accounts (default `packwise-demo`). |
| `PUBLIC_BASE_URL` | Base URL encoded in batch QR codes (e.g. your LAN IP so phones can scan). |
| `API_PORT` / `PORT` | Dev API port / production port. |

**Demo accounts** (local demonstration only): `producer@`, `transporter@`, `retailer@`, `expert@`, `admin@demo.packwise`.

---

## Five-minute demo script (matches the "focused demonstration" in the discussion record)

1. **Home → "See the cashew example"**. The Panruti → Chennai order is preloaded: 50 kg bulk for immediate use, 20 kg retail for 2 weeks, and 30 kg retail for 5 months.
2. **Journey → "Analyse route & weather"**. This fetches the live OSRM road route, the Open-Meteo forecast (rain warnings) and last year's climate at the destination. Every value is labelled *forecast* or *assumed*.
3. **Show my options**. You get four order-level plans: lowest cost, faster delivery, delay-tolerant and sustainable.
   - Open **Why this option?** to see required vs documented WVTR/OTR, the evidence table with a status and source per value, the conditions, what still needs checking, and the familiar-format example.
   - Each plan carries a **total order cost** (MOQ and setup shared across portions, each line labelled quote or estimate). The "one standard pouch vs separate pouches" comparison is shown too.
4. **Technical detail → "Retail — 5 months"**. The required WVTR ≈ 5 g/m²·day and OTR ≈ 1.3 cc/m²·day are derived, not invented. You'll also see the minimum gauges, the moisture curve, the oxygen budget, the seal specification with ASTM tests and the sampling plan, and the carton board grade from McKee.
5. **Change a condition**: **Reassess before dispatch**. Add 48 h of transit or a hotter room and see which selections remain supported.
6. **Insufficient-evidence case**: run *Mango pickle* without pH. PackWise refuses to recommend and lists the measurements needed.
7. **Fresh produce**: run *Tomato*, cool room, 5 days. Micro-perforation is sized to respiration, and Monte Carlo shows anaerobic risk in hot transit; a reefer or crate plan follows.
8. **Choose plan → Source**. Request a simulated quotation or sample and record the material-lot receiving check. Then open the **Packing guide**: pictorial steps with audio (English, Tamil, Hindi). Complete the packing checks and **create the batch**. The QR is generated only after the actual material lot is confirmed.
9. **Traceability**:
   - As the **transporter**, record dispatch. As the **retailer**, record receipt (discrepancies flagged) and a sale in **Shop billing** (unit codes; duplicate scans flagged; API key for real POS).
   - Scan the **QR / public page**: it is read-only and lets the consumer report an issue.
   - As the **producer**, open **Issues**: clusters by batch and material lot, then trace a lot to its batches, destinations and sales.
10. **Trial & Verify**: open the seeded 60-day trial. You'll see the locked pre-registration fingerprint, Welch/Newcombe confidence intervals, decisions against the locked thresholds, claim text with its conditions, and prediction vs observation.
11. **Offline**: switch the browser to airplane mode. The wizard, the recommendation engine, the library, the calculators and the assistant keep working. Batch and shipment records are queued and sent on reconnect.

---

## How each part of the discussion record is implemented

| Record section | Implementation |
|---|---|
| Journey (steps 1–8) | `src/pages/Assess.tsx` → `Results.tsx` → `Source.tsx` → `Pack.tsx` → `BatchDetail.tsx`, `Shipments.tsx`, `Retail.tsx`, `PublicBatch.tsx`, `Complaints.tsx` |
| Inputs without technical burden; statuses (measured / reported / reference / assumed / unknown) | `shared/types.ts` `Evidenced`; wizard asks only decision-relevant values; report extraction (`server/ai.ts`); status badges everywhere |
| Where AI fits and where it does not | Vision and extraction always require user confirmation. The explainer is grounded in retrieved passages. OTR, WVTR, thickness, gases and dates come only from the engine (`shared/engine/*`). |
| Recommendation sequence | `shared/engine/recommend.ts`: check inputs → needs → exclusions (listed with reasons) → documented matching → evaluation with uncertainty → order-level costs and trade-offs → explanation |
| Multiple options, journey, total cost | `transportOptions`, `transitSegments`, `storageSegment` (`journey.ts`); `aggregateOrderCost` (`cost.ts`); 4 tagged plans; reassessment (`reassess.ts`) |
| Trust: "Why this option?", familiar example, uncertainty, commercial neutrality | Evidence tables with sources; generic pack-format illustrations (no brands); P10/P50 and Monte Carlo probabilities; suppliers ranked by documentation, never by payment |
| Purchase and packing | Purchase specification, purchase checks, simulated quotations/samples, receiving check → material lot; pictorial + audio packing guide; equipment compatibility |
| QR traceability, billing, consumer issues | Batch QR after confirming the actual lot; role-limited events; split/repack with parent–child links; simulated POS + API key; complaint clustering and lot investigation; GS1-Digital-Link-style resolver `/01/{gtin}/10/{batch}` (concept only) |
| Offline assistant | PWA precache; the engine runs in the browser; BM25 retrieval over the library with citations and library date; outbox for records. The on-device LLM is left pluggable (model choice still open, per the record) — the "usable fallback for simpler phones" is implemented. |

## The five technical gaps — methods (details on the in-app **Methods & data** page)

1. **Oxygen & moisture protection.**
   - Moisture: the Labuza moisture-gain model with a linear isotherm, applied piecewise over transit and storage. The required WVTR is found by bisection and reported at 38 °C / 90 % RH.
   - Oxygen: an oxygen budget (class tolerance × mass) versus headspace O₂ plus exposure-weighted ingress. The required OTR is reported at 23 °C / 0 % RH.
   - Oxygen-control options (N₂ flush, vacuum, absorber sized in cc) are part of the evaluation.
2. **Structure & thickness.** Series-resistance laminate model. Polymer layers scale with thickness; coatings and foil are fixed. Arrhenius temperature and humidity-sensitive OTR are included. Candidates are matched on supplier-documented values, and minimum single-material gauges are reported.
3. **MAP & micro-perforation.**
   - Respiration model: Q10 plus Michaelis–Menten.
   - Per-hole Fick conductance with end correction (Fishman).
   - Steady-state design, a per-segment check (hot-transit anaerobic risk) and a transient headspace simulation.
   - 400-run Monte Carlo: probability of staying in the target window, anaerobic risk and CO₂ injury.
4. **Sealing & mechanical.**
   - Equipment compatibility (no pack you cannot close) and packing-service fallback.
   - ASTM F88 / F2096 / F1140 seal specification (proposed limits flagged for expert confirmation) and c = 0 sampling.
   - McKee box compression with derating factors, ISTA drop heights, and a puncture index for vacuum packs.
5. **Validation & claims.**
   - Pre-registered trials locked by fingerprint, with sample-size calculators.
   - Welch t-test and Newcombe intervals; decisions use the confidence interval against the locked minimum difference.
   - Claim text always carries its conditions; prediction vs observation (bias / MAE) feeds model evaluation.
   - Sustainability is compared only among suitable packs: PWM category, material mass and indicative CO₂e.

## Honesty about data

- **Commodity parameters** are *reference estimates* with ranges and sources (UNECE DDP-17, Kader, Salame/Robertson, USDA HB66). Values tagged **seed** are illustrative placeholders awaiting expert review; an expert account can approve or flag them on the Methods page.
- **Suppliers, prices, stock, transport rates and POS data are simulated.** Names are deliberately generic ("Demo …"), and no partnership or endorsement is implied.
- **The seeded trial uses demo numbers** to show the workflow.
- **Implemented is not the same as validated.** Accuracy, expert agreement and real benefit still need technical review, usability tests and real trials. Set acceptance thresholds before testing.

## Project structure

```
shared/            # runs in browser (offline) and server
  types.ts
  data/            # commodities, materials & structures, suppliers (simulated), sources, knowledge library
  engine/          # physics, geometry, barrier (Gap 2), moisture & oxygen (Gap 1), map (Gap 3),
                   # sealing (Gap 4), validation & trial (Gap 5), journey, cost, recommend, reassess, retrieval
server/            # Express 5 + node:sqlite
  index.ts, db.ts, auth.ts (scrypt, sessions, roles), ai.ts (Claude, optional), journeyService.ts (OSRM, Open-Meteo), seed.ts
  routes/core.ts   # auth, journey, assessments (+reassess), AI, expert reviews
  routes/trace.ts  # quotes, material lots, batches & QR, shipments & events, POS, public page, complaints, investigation
  routes/trials.ts # Trial & Verify
src/               # React 19 + Tailwind v4 PWA (English / Tamil / Hindi)
tests/engine.test.ts
```

## Deployment (Railway)

Live: **https://packwise-production-fc50.up.railway.app**

- Built from the `Dockerfile` (Node 24). SQLite and uploaded photos live on a Railway volume mounted at `/data`, so data survives redeploys.
- The demo-account password is the `PACKWISE_DEMO_PASSWORD` service variable. View it with `railway variables --service packwise`.
- Redeploy after changes: `railway up --service packwise`. View logs: `railway logs --service packwise`.
- Enable the AI features: `railway variables --service packwise --set ANTHROPIC_API_KEY=...`
