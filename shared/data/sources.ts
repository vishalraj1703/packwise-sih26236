import type { Source } from "../types";
import data from "../../reference-data/sources.json";

// Canonical data: reference-data/sources.json. "seed" values are illustrative until expert review.
export const SOURCES = data as unknown as Record<string, Source>;
