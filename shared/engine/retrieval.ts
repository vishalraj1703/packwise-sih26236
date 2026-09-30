// Offline retrieval (BM25) over the reviewed knowledge library, plus a
// template answerer that never invents numbers. Works in airplane mode.
import { ARTICLES, LIBRARY_UPDATED, type Article } from "../data/knowledge";
import { SOURCES } from "../data/sources";

const STOP = new Set("a an the of to for and or in on is are be it this that my our your with what how why when which can do does should i we you me about from at by as not no".split(" "));
const SYN: Record<string, string> = {
  rancid: "rancid", rancidity: "rancid", oxidation: "oxygen", oxidise: "oxygen", oxidize: "oxygen", o2: "oxygen",
  humidity: "moisture", damp: "moisture", water: "moisture", soggy: "moisture", crisp: "moisture",
  holes: "perforation", perforations: "perforation", perforated: "perforation", "micro-perforation": "perforation",
  kaju: "cashew", munthiri: "cashew", cashews: "cashew", nuts: "nuts", peanut: "nuts", groundnut: "nuts",
  box: "carton", boxes: "carton", cartons: "carton", ply: "carton",
  seal: "seal", sealing: "seal", sealer: "seal", sealed: "seal",
  recycle: "recycle", recyclable: "recycle", recycling: "recycle", plastic: "recycle",
  fridge: "temperature", cold: "temperature", reefer: "temperature", refrigerated: "temperature", heat: "temperature",
  qr: "qr", barcode: "qr", scan: "qr", trace: "traceability"
};

export function tokenize(s: string): string[] {
  const norm = (t: string) => {
    if (SYN[t]) return SYN[t];
    const stem = t.length > 3 ? t.replace(/(ies|s)$/, (m) => (m === "ies" ? "y" : "")) : t;
    return SYN[stem] ?? stem;
  };
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter((t) => t && !STOP.has(t)).map(norm);
}

const docs = ARTICLES.map((a) => ({ a, toks: tokenize(`${a.title} ${a.title} ${a.tags.join(" ")} ${a.tags.join(" ")} ${a.text}`) }));
const avgLen = docs.reduce((s, d) => s + d.toks.length, 0) / docs.length;
const df = new Map<string, number>();
for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) ?? 0) + 1);

export function search(query: string, k = 3): Array<{ article: Article; score: number }> {
  const q = tokenize(query);
  const k1 = 1.4, b = 0.75, N = docs.length;
  const scored = docs.map((d) => {
    let score = 0;
    for (const t of new Set(q)) {
      const f = d.toks.filter((x) => x === t).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.toks.length) / avgLen));
    }
    return { article: d.a, score };
  });
  return scored.filter((s) => s.score > 0.5).sort((x, y) => y.score - x.score).slice(0, k);
}

export interface OfflineAnswer {
  answer: string;
  passages: Array<{ id: string; title: string; text: string; sources: string[] }>;
  libraryUpdated: string;
  confident: boolean;
}

/** Extractive answer: returns the most relevant sentences with citations — no generated numbers. */
export function offlineAnswer(question: string): OfflineAnswer {
  const hits = search(question, 3);
  if (!hits.length) {
    return {
      answer: "I could not find this in the offline packaging library. It may need current data (prices, weather, suppliers) or an expert. Try asking about moisture, oxygen, sealing, MAP, cartons, recycling or measurements, or use the calculators.",
      passages: [], libraryUpdated: LIBRARY_UPDATED, confident: false
    };
  }
  const q = new Set(tokenize(question));
  const sentences: Array<{ s: string; id: string; score: number }> = [];
  for (const h of hits) {
    for (const s of h.article.text.split(/(?<=\.)\s+/)) {
      const toks = tokenize(s);
      const overlap = toks.filter((t) => q.has(t)).length;
      sentences.push({ s, id: h.article.id, score: overlap + h.score / 10 });
    }
  }
  const best = sentences.sort((a, b) => b.score - a.score).slice(0, 4).sort((a, b) => a.id.localeCompare(b.id));
  const answer = best.map((x) => `${x.s} [${x.id}]`).join(" ");
  return {
    answer,
    passages: hits.map((h) => ({ id: h.article.id, title: h.article.title, text: h.article.text, sources: h.article.sources.map((s) => SOURCES[s]?.title ?? s) })),
    libraryUpdated: LIBRARY_UPDATED,
    confident: hits[0].score > 3
  };
}
