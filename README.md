# PackWise — AI-assisted, evidence-backed food packaging advisor

Smart India Hackathon · Problem Statement **26236** — *AI-Based Intelligent Food Packaging Material Recommendation System for Food Commodities*.

PackWise helps farmers, startups and small food industries choose suitable packaging for their food, storage needs, transport journey and budget. It explains how to pack, finds matching suppliers, and traces each packed batch through delivery, shop billing and consumer feedback. Every recommendation shows **why it fits, what evidence supports it, what conditions it requires and what still needs checking.**

- **Live web app:** https://packwise-production-fc50.up.railway.app
- **Android app (APK):** https://packwise-production-fc50.up.railway.app/downloads/packwise-arm64.apk (most phones from 2017 onwards; `packwise-armv7.apk` is for older phones)

> The scientific engine assesses. AI only identifies (with user confirmation), extracts and explains. The LLM never invents specifications or shelf-life.

---

## Technology stack — what is implemented

| Layer | Planned technology | Status | Where |
|---|---|---|---|
| Mobile app | Flutter + Dart (camera, regional languages, offline) | ✅ Built. Android APK; camera photo → identification; QR scanner; English, Tamil and Hindi with audio packing steps; offline results, library and assistant | `mobile/` |
| Web dashboard | React + TypeScript | ✅ React 19, Vite, Tailwind v4, installable PWA | `src/` |
| Backend | Python + FastAPI | ✅ All APIs: assessment, journey, sourcing, batches, QR, shipments, POS, complaints, trials, AI, ML | `backend/app/` |
| Validation | Pydantic | ✅ Pydantic v2. Unit ranges per measured value plus an evidence status (measured / reported / reference / assumed / unknown) | `backend/app/schemas.py` |
| Database | PostgreSQL | ✅ PostgreSQL on Railway; SQLite file for local development (same SQLAlchemy 2 models) | `backend/app/db.py` |
| Science | NumPy + SciPy | ✅ Moisture (Labuza), oxygen budget, laminate barrier, MAP with `brentq` and `solve_ivp`, vectorised Monte Carlo, `scipy.stats` (Welch, Newcombe) | `backend/app/engine/` |
| Recommendation | Expert rules + constraint filtering + transparent ranking | ✅ Needs → exclusions (with reasons) → documented matching → physics evaluation → order-level cost → 4 tagged plans | `backend/app/engine/recommend.py` |
| ML (optional) | scikit-learn + XGBoost | ✅ Gated. Stays **off** until ≥ 60 reviewed observations, ≥ 3 trials and ≥ 2 commodities exist **and** it beats the physics baseline in leave-one-trial-out testing | `backend/app/ml/shelf_life.py` |
| Image identification | TFLite-compatible on-device model | ⚠️ Partly done. Server-side vision identification (always confirmed by the user) plus a manual photo grid. **The on-device TFLite model is not trained yet**: it needs a labelled photo set of Indian commodities | `backend/app/services/ai.py`, `mobile/lib/screens/assess.dart` |
| Assistant | Hosted LLM + retrieval | ✅ Claude (`claude-opus-5-5`), grounded in the cited library (BM25 retrieval); answers cite `[K#]`. Turns on when `ANTHROPIC_API_KEY` is set | `backend/app/services/ai.py`, `backend/app/engine/retrieval.py` |
| Offline assistant | Small quantised model, *to be benchmarked* | ⚠️ Fallback done, model not chosen. BM25 retrieval over the bundled library works fully offline on the phone and in the browser. Choosing an on-device LLM still needs the benchmark described in the record | `mobile/lib/core/retrieval.dart`, `shared/engine/retrieval.ts` |
| Offline storage | SQLite (mobile), IndexedDB (web) | ✅ `sqflite` key-value store + outbox on the phone; IndexedDB key-value store + outbox in the browser; records sync on reconnect | `mobile/lib/core/store.dart`, `src/lib/idb.ts` |
| External data | Weather and route APIs | ✅ OSRM road route + Open-Meteo forecast and climate. Labelled straight-line fallback when offline | `backend/app/services/journey.py` |
| Traceability | QR generator/scanner + batch-event API | ✅ `qrcode` SVG; Flutter `mobile_scanner`; role-checked events; split/repack; GS1 Digital Link–style resolver | `backend/app/routers/trace.py`, `mobile/lib/screens/scan.dart` |
| File storage | S3-compatible object storage | ✅ `boto3` when `S3_BUCKET` (+ `S3_ENDPOINT_URL` for R2/MinIO) is set; local disk/volume otherwise | `backend/app/storage.py` |
| Testing | pytest, Flutter tests, Playwright | ✅ 30 pytest tests (including a **TypeScript ↔ Python engine parity test**); 11 Flutter tests; 7 Playwright tests; 26 Vitest engine tests | `backend/tests/`, `mobile/test/`, `e2e/`, `tests/` |
| Deployment | Docker + managed cloud | ✅ Multi-stage `Dockerfile` (Node builds the web, Python serves it) on Railway with PostgreSQL and a volume | `Dockerfile` |

All pictures are **real, credited photos** from Wikimedia Commons: 14 foods and 7 pack formats. Brand mentions ("looks like Nandini milk sachets") describe visible pack formats only. No brand endorses PackWise. Credits are on the **Methods & data** page and in the app's Account screen.

---

## Architecture

```
reference-data/        canonical JSON shared by every client: commodities, materials & structures,
                       suppliers (simulated), sources, knowledge library, brand examples, places, photos
backend/  (Python)     FastAPI · Pydantic · SQLAlchemy (PostgreSQL / SQLite) · NumPy · SciPy · scikit-learn · XGBoost
  app/engine/          physics, geometry, barrier (gap 2), moisture & oxygen (gap 1), map (gap 3), sealing (gap 4),
                       validation & trial (gap 5), journey, cost, recommend, reassess, retrieval
  app/routers/         core (auth, journey, assessments, AI, reviews, examples, ML), trace (QR & supply chain), trials
  app/ml/              gated shelf-life model
  tests/               pytest (+ parity test against the TypeScript engine)
src/ + shared/ (TS)    React web dashboard. shared/engine is a TypeScript copy of the engine that the browser
                       uses only when offline (kept identical to Python by the parity test)
mobile/   (Flutter)    Android app: assess with camera, results with photos, audio packing guide, QR scan,
                       consumer issue report, offline library/assistant, SQLite outbox
e2e/                   Playwright tests
```

---

## Running locally

Requirements: **Python 3.12+**, **Node.js 24+**. Flutter 3.38+ is needed only for the mobile app.

```bash
pip install -r backend/requirements.txt
npm install
npm run dev          # FastAPI on :8787 + web on http://localhost:5173
```

Tests:

```bash
npm run test:api     # pytest — engine, API, TS↔Python parity
npm test             # Vitest — TypeScript (offline) engine
npm run test:e2e     # Playwright — uses the installed Chrome (PW_CHANNEL=msedge for Edge)
cd mobile && flutter test
```

Reset the demo database: `cd backend && python -m app.seed --reset`.

### Mobile app

```bash
cd mobile
flutter pub get
flutter run                                           # phone connected over USB, or an emulator
flutter build apk --release --split-per-abi           # APKs in build/app/outputs/flutter-apk/
flutter build apk --dart-define=API_BASE=http://192.168.1.10:8787   # point at your own server
```

On Windows, if Gradle says *"Unable to establish loopback connection"*, set these first:
`TMP=C:\tmp`, `TEMP=C:\tmp`, `GRADLE_OPTS=-Djdk.net.unixdomain.tmpdir=C:/tmp -Djava.io.tmpdir=C:/tmp` and `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/tmp`.

### Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL. Default is a SQLite file in `data/` |
| `ANTHROPIC_API_KEY` | Optional. Enables photo identification, report extraction and the online explainer. Without it, users pick the food and enter values by hand, and the offline assistant is used |
| `PACKWISE_MODEL` | Default `claude-opus-5-5` |
| `PACKWISE_DEMO_PASSWORD` | Password for the seeded demo accounts |
| `PUBLIC_BASE_URL` | Base URL encoded in batch QR codes (e.g. your LAN IP so phones can scan) |
| `S3_BUCKET`, `S3_ENDPOINT_URL` | S3-compatible storage for uploaded photos and documents (plus the standard `AWS_*` keys) |
| `PACKWISE_DATA_DIR`, `PACKWISE_UPLOAD_DIR`, `PACKWISE_WEB_DIST` | Paths (set in the Docker image) |

**Demo accounts** (demonstration only): `producer@`, `transporter@`, `retailer@`, `expert@`, `admin@demo.packwise`.

---

## Five-minute demo script

1. **Home → "See the cashew example"**. The Panruti → Chennai order is preloaded: 50 kg bulk for immediate use, 20 kg retail for 2 weeks, and 30 kg retail for 5 months.
2. **Journey → "Analyse route & weather"**. This fetches the live OSRM road route, the Open-Meteo forecast (rain warnings) and last year's climate at the destination. Every value is labelled *forecast* or *assumed*.
3. **Show my options**. You get four order-level plans: lowest cost, faster delivery, delay-tolerant and sustainable. Each pack has a real photo and a "Looks like: Aavin, Amul, Nandini milk sachets"-style example.
   - Open **Why this option?** to see required vs documented WVTR/OTR, the evidence table with a status and source per value, the conditions, and what still needs checking.
4. **Technical detail → "Retail — 5 months"**. The required WVTR ≈ 5 g/m²·day and OTR ≈ 1.3 cc/m²·day are derived, not invented. You'll also see the minimum gauges, the moisture curve, the oxygen budget, the seal specification with ASTM tests and the sampling plan, and the carton board grade from McKee.
5. **Reassess before dispatch**: add 48 h of transit or a hotter room and see which selections remain supported.
6. **Insufficient-evidence case**: run *Mango pickle* without pH. PackWise refuses to recommend and lists the measurements needed.
7. **Fresh produce**: run *Tomato*, cool room, 5 days. Micro-perforation is sized to respiration, and Monte Carlo shows anaerobic risk in hot transit.
8. **Choose plan → Source → Packing guide → create batch**. The QR is generated only after the actual material lot is confirmed.
9. **Traceability**:
   - Transporter dispatch, then retailer receipt and sale.
   - Scan the QR with the **mobile app**. The public page lets a consumer report an issue, and the report is queued offline if needed.
   - The producer sees issue clusters and can trace a lot.
10. **Trial & Verify**: open the seeded 60-day trial. You'll see the locked pre-registration fingerprint, confidence intervals and decisions, claim text with its conditions, and the ML gate status.
11. **Offline**: turn on airplane mode. The phone app keeps the last result, the library, the assistant and the packing guide. The web app computes with its offline engine copy and queues records in IndexedDB.

## The five technical gaps — methods (details on the in-app **Methods & data** page)

1. **Oxygen & moisture protection.**
   - Moisture: the Labuza moisture-gain model, applied piecewise over transit and storage. The required WVTR is found by `scipy.optimize.brentq` and reported at 38 °C / 90 % RH.
   - Oxygen: an oxygen budget (tolerance × mass) versus headspace O₂ plus ingress. The required OTR is reported at 23 °C / 0 % RH.
2. **Structure & thickness.** Series-resistance laminate model with Arrhenius and humidity-sensitive OTR. Candidates are matched on supplier-documented values, and minimum gauges are reported.
3. **MAP & micro-perforation.**
   - Respiration model: Q10 plus Michaelis–Menten. Per-hole Fishman conductance.
   - Steady-state design by `brentq`; transient headspace simulation by `solve_ivp` (LSODA).
   - Vectorised NumPy Monte Carlo: in-window probability, anaerobic risk and CO₂ injury.
4. **Sealing & mechanical.** Equipment compatibility, ASTM F88 / F2096 / F1140 seal specification, c = 0 sampling, McKee box compression, ISTA drop heights.
5. **Validation & claims.**
   - Pre-registered trials locked by fingerprint.
   - Welch t-test (`scipy.stats`) and Newcombe intervals.
   - Claims always carry their conditions; prediction vs observation feeds the gated ML.

## Honesty about data and limits

- **Commodity parameters** are reference estimates with ranges and sources (UNECE DDP-17, Kader, Salame/Robertson, USDA HB66). Values tagged **seed** await expert review; an expert account can approve or flag them.
- **Suppliers, prices, stock, transport rates and POS data are simulated** ("Demo …" names). No partnership or endorsement is implied.
- **The seeded trial uses demo numbers** to show the workflow.
- **Not done yet (needs data or a decision, not code):**
  - The on-device TFLite food-identification model needs a labelled photo dataset.
  - The offline small LLM needs the benchmark the record calls for.
  - Expert review of the seed values.
  - Real supplier onboarding.
- **Implemented is not the same as validated.** Accuracy, expert agreement and real benefit still need technical review, usability tests and real trials.

## Deployment (Railway)

- The `Dockerfile` has two stages. Stage 1 (Node 24) builds the web dashboard. Stage 2 (Python 3.12) runs FastAPI with uvicorn and serves the built dashboard.
- **PostgreSQL** is a Railway database service. The app's `DATABASE_URL` is the reference variable `${{Postgres.DATABASE_URL}}`. Uploaded photos live on the `/data` volume (or S3 if configured).
- Redeploy: `railway up --service packwise`. Logs: `railway logs --service packwise`.
- The demo password is in `railway variables --service packwise`.
- Enable AI: `railway variables --service packwise --set ANTHROPIC_API_KEY=...`
- The Android APKs are copied into `public/downloads/` before deploying. They are not committed to git because of their size.
