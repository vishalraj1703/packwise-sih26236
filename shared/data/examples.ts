import type { PackFormat } from "../types";
import data from "../../reference-data/examples.json";

// Real products seen in Indian shops, grouped by the visible packaging format.
// Canonical data: reference-data/examples.json.
export interface FamiliarExample {
  id: string;
  products: string;
  brands: string[];
  structureIds: string[];
  format: PackFormat;
  visible: string[];
  sameNeed: string;
}

export const FAMILIAR_EXAMPLES = data.examples as unknown as FamiliarExample[];
export const EXAMPLE_DISCLAIMER: string = data.disclaimer;

export function examplesFor(structureId: string): FamiliarExample[] {
  return FAMILIAR_EXAMPLES.filter((e) => e.structureIds.includes(structureId));
}
