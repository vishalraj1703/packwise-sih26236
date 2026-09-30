import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LANGS, useI18n } from "../lib/i18n";
import { outbox } from "../lib/api";
import ErrorBoundary from "./ErrorBoundary";

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

function OutboxBar({ online }: { online: boolean }) {
  const [items, setItems] = useState(outbox.list());
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const f = () => setItems(outbox.list());
    window.addEventListener("outbox-changed", f);
    return () => window.removeEventListener("outbox-changed", f);
  }, []);
  if (!items.length && !msg) return null;
  return (
    <div className="no-print border-b border-line bg-accent-2 px-4 py-2 text-sm text-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        {items.length > 0 && <span><strong>{items.length}</strong> saved offline, not yet sent: {items.map((i) => i.label).join(", ")}</span>}
        {items.length > 0 && <button className="btn-ghost btn-sm" disabled={!online} onClick={async () => { const r = await outbox.sync(); setMsg(`Sent ${r.sent}.${r.failed.length ? ` Failed: ${r.failed.join("; ")}` : ""}`); }}>Send now</button>}
        {msg && <span className="text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const role = user?.role;
  const links: Array<{ to: string; label: string; show: boolean }> = [
    { to: "/assess", label: t("nav.assess"), show: true },
    { to: "/work", label: t("nav.work"), show: !!user && (role === "producer" || role === "admin" || role === "expert") },
    { to: "/batches", label: t("nav.batches"), show: !!user },
    { to: "/shipments", label: t("nav.shipments"), show: !!user },
    { to: "/retail", label: t("nav.retail"), show: role === "retailer" || role === "admin" },
    { to: "/complaints", label: t("nav.complaints"), show: role === "producer" || role === "expert" || role === "admin" },
    { to: "/trials", label: t("nav.trials"), show: !!user && role !== "transporter" && role !== "retailer" },
    { to: "/assistant", label: t("nav.assistant"), show: true },
    { to: "/library", label: t("nav.library"), show: true },
    { to: "/evidence", label: t("nav.evidence"), show: true }
  ];
  return (
    <div className="min-h-screen">
      {!online && <div className="no-print bg-ink px-4 py-1.5 text-center text-xs text-white">{t("offline")}</div>}
      <OutboxBar online={online} />
      <header className="no-print sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-brand">
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg">PackWise</span>
          </Link>
          <nav className="ml-4 hidden flex-1 flex-wrap gap-1 lg:flex">
            {links.filter((l) => l.show).map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `rounded-lg px-2.5 py-1.5 text-sm font-medium ${isActive ? "bg-brand-3 text-brand" : "text-ink-2 hover:text-ink"}`}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <select aria-label="Language" className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm" value={lang} onChange={(e) => setLang(e.target.value as any)}>
              {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="chip bg-brand-3 text-brand" title={user.email}>{user.role}</span>
                <button className="btn-ghost btn-sm" onClick={logout}>{t("nav.logout")}</button>
              </div>
            ) : (
              <Link to="/login" className="btn-primary btn-sm hidden sm:inline-flex">{t("nav.login")}</Link>
            )}
            <button className="btn-ghost btn-sm lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">☰</button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-4 py-2 lg:hidden">
            <div className="mx-auto grid max-w-6xl gap-1">
              {links.filter((l) => l.show).map((l) => <NavLink key={l.to} to={l.to} className="rounded-lg px-2 py-2 text-sm font-medium text-ink-2 hover:bg-brand-3">{l.label}</NavLink>)}
              {user ? <button className="rounded-lg px-2 py-2 text-left text-sm font-medium text-ink-2" onClick={logout}>{t("nav.logout")} ({user.role})</button> : <NavLink to="/login" className="rounded-lg px-2 py-2 text-sm font-semibold text-brand">{t("nav.login")}</NavLink>}
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
      </main>
      <footer className="no-print border-t border-line px-4 py-6 text-center text-xs text-ink-3">
        SIH Problem Statement 26236 prototype · Supplier, price, transport and billing data are simulated · Seed commodity data await expert review ·{" "}
        <Link className="underline" to="/evidence">Methods & data</Link> · <Link className="underline" to="/evidence#photo-credits">Photo credits</Link>
      </footer>
    </div>
  );
}
