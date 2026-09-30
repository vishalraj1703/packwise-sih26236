import type { Commodity } from "../types";
import data from "../../reference-data/commodities.json";

// Canonical data lives in reference-data/commodities.json (shared with the Python backend and the Flutter app).
export const COMMODITIES = data as unknown as Commodity[];

export function getCommodity(id: string): Commodity {
  const c = COMMODITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown commodity ${id}`);
  return c;
}

export function searchCommodities(q: string): Commodity[] {
  const s = q.trim().toLowerCase();
  if (!s) return COMMODITIES;
  return COMMODITIES.filter(
    (c) => c.name.toLowerCase().includes(s) || c.aliases.some((a) => a.includes(s) || s.includes(a)) || Object.values(c.names).some((n) => n && n.includes(q.trim()))
  );
}
