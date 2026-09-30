import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Card, ErrorBox, Field } from "../components/ui";

const DEMO = [
  ["producer@demo.packwise", "Producer — assessments, batches, QR, shipments, issues, trials"],
  ["transporter@demo.packwise", "Transporter — dispatch & handoff events"],
  ["retailer@demo.packwise", "Retailer — receipt & simulated shop billing"],
  ["expert@demo.packwise", "Expert reviewer — data review, trials, issue review"]
];

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === "login") await login(email, password); else await register({ email, password, name, org });
      nav(params.get("next") ?? "/work");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
      <Card title={mode === "login" ? "Sign in" : "Create a producer account"}>
        <form className="space-y-3" onSubmit={submit}>
          {mode === "register" && <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>}
          {mode === "register" && <Field label="Farm / business (optional)"><input className="input" value={org} onChange={(e) => setOrg(e.target.value)} /></Field>}
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Field>
          <Field label="Password" hint={mode === "register" ? "At least 8 characters" : undefined}><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
          <ErrorBox error={err} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          <button type="button" className="w-full text-sm text-brand underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "New producer? Create an account" : "Have an account? Sign in"}
          </button>
        </form>
      </Card>
      <Card title="Demo accounts (local prototype)">
        <p className="muted mb-3">Seeded for demonstration. The shared demo password is set by <code>PACKWISE_DEMO_PASSWORD</code> (see <code>.env.example</code>). Transporter, retailer and expert roles are assigned by an admin, not self-registered.</p>
        <ul className="space-y-2">
          {DEMO.map(([e, d]) => (
            <li key={e}>
              <button className="w-full rounded-xl border border-line px-3 py-2 text-left hover:border-brand-2" onClick={() => { setMode("login"); setEmail(e); }}>
                <div className="text-sm font-semibold">{e}</div><div className="text-xs text-ink-2">{d}</div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
