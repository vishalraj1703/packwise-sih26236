import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SOURCES } from "../../shared/data/sources";
import { useI18n } from "../lib/i18n";

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="h2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_STYLE: Record<string, string> = {
  measured: "bg-good-bg text-good",
  reported: "bg-info-bg text-info",
  reference: "bg-accent-2 text-warn",
  assumed: "bg-[#efe9f7] text-[#5b3f8c]",
  unknown: "bg-bad-bg text-bad",
  calculated: "bg-brand-3 text-brand",
  documented: "bg-info-bg text-info",
  generic: "bg-accent-2 text-warn",
  user: "bg-info-bg text-info",
  forecast: "bg-info-bg text-info"
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const label = t(`status.${status}`) !== `status.${status}` ? t(`status.${status}`) : status.replace(/-/g, " ");
  return <span className={`chip ${STATUS_STYLE[status] ?? "bg-line text-ink-2"}`} title="Evidence status">{label}</span>;
}

export function SupportBadge({ support, large = false }: { support: "supported" | "conditional" | "not-supported"; large?: boolean }) {
  const { t } = useI18n();
  const style = support === "supported" ? "bg-good-bg text-good" : support === "conditional" ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad";
  const icon = support === "supported" ? "✓" : support === "conditional" ? "!" : "✕";
  return <span className={`chip ${style} ${large ? "px-3 py-1 text-sm" : ""}`}><span aria-hidden>{icon}</span>{t(`support.${support}`)}</span>;
}

export function SourceRef({ id }: { id?: string }) {
  if (!id) return null;
  const s = SOURCES[id];
  if (!s) return null;
  return (
    <Link to={`/evidence#src-${id}`} className="chip bg-surface text-ink-2 border border-line hover:border-brand-2" title={s.title}>
      {s.kind === "seed" ? "seed value" : s.kind === "simulated" ? "simulated" : id}
    </Link>
  );
}

export function Spinner({ label = "Working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-2" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-3 border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="rounded-xl border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad" role="alert">{error}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "good" | "bad"; children: ReactNode }) {
  const cls = { info: "bg-info-bg text-info border-info/20", warn: "bg-warn-bg text-warn border-warn/20", good: "bg-good-bg text-good border-good/20", bad: "bg-bad-bg text-bad border-bad/20" }[tone];
  return <div className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className="text-lg font-bold text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: ReactNode }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-surface p-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${value === t.id ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line">
      <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{summary}</span><span className="text-ink-3">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-line px-3 py-3">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-2">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
