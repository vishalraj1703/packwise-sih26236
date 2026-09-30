import type { Structure } from "../types";

export interface PackGeometry {
  fillKg: number;
  packVolumeL: number;
  flatWidthCm: number;
  flatLengthCm: number;
  permeableAreaM2: number;
  headspaceL: number; // free gas volume inside the sealed pack (interstitial + headspace)
  basis: string;
}

/**
 * Pillow / stand-up pouch sizing. Uses the pillow volume approximation
 * V ≈ W³·[h/(πW) − 0.142·(1 − 10^(−h/W))] with h = 1.4·W and a 15% fill allowance.
 * Permeable area = both faces of the flat pouch minus ~10% for seals.
 */
export function pouchGeometry(fillKg: number, bulkDensityKgPerL: number, trueDensityKgPerL = 1.05, vacuum = false): PackGeometry {
  const productVolL = fillKg / bulkDensityKgPerL;
  const packVolL = productVolL * 1.15;
  const aspect = 1.4;
  const shape = aspect / Math.PI - 0.142 * (1 - Math.pow(10, -aspect));
  const wM = Math.cbrt(packVolL / 1000 / shape);
  const hM = aspect * wM;
  const area = 2 * wM * hM * 0.9;
  const solidL = fillKg / trueDensityKgPerL;
  let headspace = Math.max(packVolL - solidL, 0.02 * packVolL);
  if (vacuum) headspace = Math.max(0.03 * packVolL, 0.002);
  return {
    fillKg,
    packVolumeL: packVolL,
    flatWidthCm: wM * 100 + 2, // + seal margins
    flatLengthCm: hM * 100 + 3,
    permeableAreaM2: area,
    headspaceL: headspace,
    basis: "Pillow-pouch volume approximation with 15% fill allowance; 10% of film area assumed in seals."
  };
}

/** Rigid containers scale surface with size^(2/3) from their reference size. */
export function rigidScale(structure: Structure, fillKg: number): number {
  const ref = structure.rigid?.refSizeKg ?? 1;
  return Math.pow(fillKg / ref, 2 / 3);
}

export function packGeometry(structure: Structure, fillKg: number, bulkDensity: number, trueDensity: number, vacuum: boolean): PackGeometry {
  if (structure.rigid) {
    const g = pouchGeometry(fillKg, bulkDensity, trueDensity, vacuum);
    return { ...g, basis: "Rigid container: performance scaled from reference size by (size/ref)^(2/3)." };
  }
  return pouchGeometry(fillKg, bulkDensity, trueDensity, vacuum);
}

/** Film mass per pack (g) from layer thickness × density × total film area (both faces + seals). */
export function filmMassG(structure: Structure, geom: PackGeometry, densityOf: (id: string) => number): number {
  if (structure.rigid) return structure.rigid.massG * rigidScale(structure, geom.fillKg);
  const totalAreaM2 = (geom.flatWidthCm / 100) * (geom.flatLengthCm / 100) * 2 * (structure.format === "stand-up-pouch" ? 1.25 : 1);
  return structure.layers.reduce((sum, l) => sum + l.thicknessUm * 1e-6 * totalAreaM2 * densityOf(l.materialId) * 1e6, 0);
}
