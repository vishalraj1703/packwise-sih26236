// Fetch helper with an offline outbox: writes made while offline are queued
// locally and sent when connectivity returns (explicit, user-visible sync).

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: string[]) { super(message); }
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const init: RequestInit = { credentials: "same-origin", ...opts };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers = { "content-type": "application/json", ...(opts.headers ?? {}) };
    init.method = opts.method ?? "POST";
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError("You appear to be offline. This action needs a connection.", 0);
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.details);
  return data as T;
}

export interface OutboxItem { id: string; path: string; body: unknown; label: string; createdAt: string }
const KEY = "packwise-outbox";

function read(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function write(items: OutboxItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("outbox-changed"));
}

export const outbox = {
  list: read,
  add(path: string, body: unknown, label: string) {
    write([...read(), { id: crypto.randomUUID(), path, body, label, createdAt: new Date().toISOString() }]);
  },
  remove(id: string) { write(read().filter((x) => x.id !== id)); },
  async sync(): Promise<{ sent: number; failed: string[] }> {
    const items = read();
    let sent = 0;
    const failed: string[] = [];
    for (const it of items) {
      try {
        await api(it.path, { json: it.body });
        outbox.remove(it.id);
        sent++;
      } catch (e) {
        failed.push(`${it.label}: ${(e as Error).message}`);
        if ((e as ApiError).status === 0) break;
      }
    }
    return { sent, failed };
  }
};

/** Per-viewer convenience storage; never required for correctness. */
export const local = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
};
