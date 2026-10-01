import { useEffect, useRef, useState } from "react";
import { offlineAnswer } from "../../shared/engine/retrieval";
import { LIBRARY_UPDATED } from "../../shared/data/knowledge";
import { api } from "../lib/api";
import { idb } from "../lib/idb";
import { useI18n } from "../lib/i18n";
import { Card, Notice } from "../components/ui";

interface Msg { role: "user" | "assistant"; content: string; mode?: "offline" | "online"; passages?: Array<{ id: string; title: string }> }

const SUGGESTED = ["Why does cashew need nitrogen flushing for 5 months?", "What do OTR and WVTR mean?", "How many packs should I leak-test?", "Why is my tomato pack going sour in hot transit?", "Is a compostable pouch better?"];

export default function Assistant() {
  const { langName } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [ai, setAi] = useState(false);
  const [mode, setMode] = useState<"auto" | "offline">("auto");
  const [busy, setBusy] = useState(false);
  const [useContext, setUseContext] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { api<{ ai: boolean }>("/status").then((s) => setAi(s.ai)).catch(() => setAi(false)); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const context = async () => {
    const l = await idb.get<any>("local-result", null);
    if (!l || !useContext) return "";
    const r = l.result;
    return `Food: ${r.commodity.name}. Journey ${r.input.journey.origin.name} to ${r.input.journey.destination.name}. ` + r.plans.map((p: any) => `${p.tags.join("/")}: total ₹${Math.round(p.cost.totalInr)}; ${p.whatItCommunicates}`).join(" ") + " " +
      r.portions.map((p: any) => `${p.portion.label}: ${p.requirements.map((x: any) => `${x.label} ${x.value}`).join("; ")}`).join(" ");
  };
  const ask = async (text: string) => {
    if (!text.trim()) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setQ("");
    setBusy(true);
    try {
      if (mode === "auto" && ai && navigator.onLine) {
        const r = await api<{ answer: string; passages: any[] }>("/ai/chat", { json: { question: text, history, context: await context(), language: langName } });
        setMsgs((m) => [...m, { role: "assistant", content: r.answer, mode: "online", passages: r.passages }]);
      } else throw new Error("offline");
    } catch {
      const o = offlineAnswer(text);
      setMsgs((m) => [...m, { role: "assistant", content: o.answer, mode: "offline", passages: o.passages.map((p) => ({ id: p.id, title: p.title })) }]);
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Packaging assistant</h1>
        <div className="flex items-center gap-2 text-sm">
          <select className="input w-auto py-1.5" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="auto">{ai ? "Online explainer when connected" : "Offline library (AI not configured)"}</option>
            <option value="offline">Offline library only</option>
          </select>
        </div>
      </div>
      <Notice tone="info">
        Offline mode answers from the reviewed packaging library on this device (updated {LIBRARY_UPDATED}) and never invents numbers. The online explainer only rephrases retrieved evidence and your results; it must not invent OTR, WVTR, thickness, gas mixtures or expiry dates. Conversations are not stored on the server.
      </Notice>
      <Card>
        <div className="min-h-64 space-y-3">
          {msgs.length === 0 && (
            <div className="space-y-2">
              <p className="muted">Try:</p>
              <div className="flex flex-wrap gap-2">{SUGGESTED.map((s) => <button key={s} className="btn-ghost btn-sm" onClick={() => ask(s)}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "ml-10 bg-brand text-white" : "mr-6 bg-surface"}`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === "assistant" && (
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-ink-3">
                  <span className="chip bg-white">{m.mode === "online" ? "online explainer" : `offline library · ${LIBRARY_UPDATED}`}</span>
                  {m.passages?.map((p) => <span key={p.id} className="chip bg-white">[{p.id}] {p.title}</span>)}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="text-sm text-ink-3">Thinking…</div>}
          <div ref={end} />
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about packing, sealing, moisture, MAP…" />
          <button className="btn-primary" disabled={busy || !q.trim()}>Ask</button>
        </form>
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} />Include my latest on-device result as context (online mode)</label>
      </Card>
    </div>
  );
}
