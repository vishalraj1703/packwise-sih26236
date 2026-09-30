import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { PackIllustration } from "../components/Illustrations";

const JOURNEY = [
  ["1", "Identify the food", "Photo or selection; you confirm. Fresh, cut, dried, roasted…"],
  ["2", "Describe the order", "Quantity, portions, storage days, pack sizes, equipment, budget."],
  ["3", "Describe the journey", "Route, date, vehicle and storage — route and weather analysed."],
  ["4", "Compare feasible plans", "Only technically supported options, with total order cost."],
  ["5", "Understand & choose", "“Why this option?” — evidence, conditions, what to check."],
  ["6", "Source & pack", "Matching suppliers, quotations, pictorial packing guide."],
  ["7", "Create the batch record", "Confirm the material lot used → QR code."],
  ["8", "Follow the outcome", "Dispatch, receipt, shop billing and consumer issues."]
];

const GAPS = [
  ["Oxygen & moisture protection", "Required OTR/WVTR derived from sorption and oxygen-budget models over the full exposure profile, at standard test conditions."],
  ["Structure & thickness", "Series-resistance laminate model matched against supplier-documented structures; minimum gauges shown."],
  ["MAP & micro-perforation", "Respiration (Q10 + Michaelis–Menten) balanced against film and perforation gas exchange, with Monte Carlo risk."],
  ["Sealing & mechanical", "Equipment compatibility, seal specification with ASTM tests, c=0 sampling, McKee box compression and drop heights."],
  ["Validation & claims", "Pre-registered trials with locked thresholds, confidence intervals and claims that carry their conditions."]
];

export default function Home() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 rounded-3xl bg-brand px-6 py-10 text-white sm:px-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">Smart India Hackathon · PS 26236</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{t("home.title")}</h1>
          <p className="mt-4 max-w-2xl text-white/85">{t("home.sub")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/assess" className="btn-accent">{t("home.start")} →</Link>
            <Link to="/assess?example=cashew" className="btn border border-white/30 text-white hover:bg-white/10">{t("home.worked")}</Link>
          </div>
          {!user && <p className="mt-4 text-xs text-white/70">Works without signing in and offline. Sign in to save assessments, create batch QR codes and trace shipments.</p>}
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-white/10 p-4">
          {(["stand-up-pouch", "vacuum-pack", "tin", "sack-liner", "crate", "jar"] as const).map((f) => (
            <div key={f} className="flex flex-col items-center rounded-xl bg-white p-2">
              <PackIllustration format={f} className="h-16 w-16" />
              <span className="text-[11px] font-medium text-ink-2">{f.replace("-", " ")}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="h2 mb-1">What you receive</h2>
        <p className="muted mb-4 max-w-3xl">A small set of feasible packaging-and-journey options — with technical requirements, total order cost, conditional performance, sustainable alternatives, pictorial instructions and the evidence behind each choice. You make the final choice.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Lowest evaluated cost", "Cheapest qualifying plan, assumptions stated."], ["Faster delivery", "Shorter journey and its extra cost."], ["Greater tolerance for delays", "Still within limits if transit is delayed and hotter."], ["Sustainable alternative", "Better documented recyclability among feasible packs."]].map(([a, b]) => (
            <div key={a} className="card p-4"><div className="font-semibold">{a}</div><div className="muted mt-1">{b}</div></div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="h2 mb-4">The complete journey</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map(([n, a, b]) => (
            <li key={n} className="card p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-ink">{n}</div>
              <div className="font-semibold">{a}</div>
              <div className="muted mt-1">{b}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">How the five technical gaps are handled</h2>
          <Link to="/evidence" className="text-sm font-semibold text-brand underline">Methods, equations & data →</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {GAPS.map(([a, b], i) => (
            <div key={a} className="rounded-xl bg-surface p-3">
              <div className="text-xs font-bold text-brand-2">GAP {i + 1}</div>
              <div className="font-semibold">{a}</div>
              <div className="mt-1 text-xs text-ink-2">{b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {[["Farmers", "Simple questions, Tamil/Hindi help, spoken packing steps."], ["Startups", "Affordable trials and sourcing comparisons."], ["Small industries", "Specifications, equipment checks and batch records."], ["Researchers", "Inspectable sources, assumptions and model outputs."]].map(([a, b]) => (
          <div key={a} className="rounded-2xl border border-line bg-white p-4"><div className="font-semibold">{a}</div><div className="muted mt-1">{b}</div></div>
        ))}
      </section>

      <section className="rounded-2xl border border-line bg-accent-2 p-5 text-sm text-ink">
        <strong>Our promise:</strong> for each recommendation, we show why it fits, what evidence supports it, what conditions it requires and what still needs checking.
        Commodity values in this prototype are reference or illustrative seed values awaiting expert review; supplier, price, transport and billing data are simulated.
      </section>
    </div>
  );
}
