import data from "../../reference-data/images.json";

// Real, credited photos (Wikimedia Commons) for foods and visible pack formats.
type Credit = { file: string; title?: string; author: string; license: string; licenseUrl: string; source: string; caption?: string };
const foods = data.foods as Record<string, Credit>;
const packs = data.packs as Record<string, Credit>;

export const foodImage = (id: string): string | null => (foods[id] ? `/images/${foods[id].file}` : null);
export const foodCredit = (id: string): Credit | null => foods[id] ?? null;
export const packImage = (format: string): string | null => (packs[format] ? `/images/${packs[format].file}` : null);
export const packCredit = (format: string): Credit | null => packs[format] ?? null;
export const ALL_CREDITS = [...Object.entries(foods), ...Object.entries(packs)];
