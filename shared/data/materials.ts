import type { Material, Structure } from "../types";
import data from "../../reference-data/materials.json";

// Canonical data: reference-data/materials.json. Generic literature-typical barrier values
// (POLYMER-HANDBOOK); a supplier's film is always matched on its own documented test report.
export const MATERIALS = data.materials as unknown as Record<string, Material>;
export const STRUCTURES = data.structures as unknown as Structure[];
export const COMMON_GAUGES_UM: number[] = data.commonGaugesUm;
/** Everyday names a farmer or shopkeeper would recognise (shown before the technical name). */
export const PLAIN_NAMES: Record<string, string> = data.plainNames;

export function getStructure(id: string): Structure {
  const s = STRUCTURES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown structure ${id}`);
  return s;
}
export const plainName = (id: string) => PLAIN_NAMES[id] ?? getStructure(id).name;
