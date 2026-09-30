"""Pack geometry: pillow/stand-up pouch sizing and rigid-container scaling."""
from __future__ import annotations

import math


def pouch_geometry(fill_kg: float, bulk_density: float, true_density: float = 1.05, vacuum: bool = False) -> dict:
    """Pillow-pouch volume V ≈ W³·[h/(πW) − 0.142(1 − 10^(−h/W))], h = 1.4 W, 15 % fill allowance."""
    product_l = fill_kg / bulk_density
    pack_l = product_l * 1.15
    aspect = 1.4
    shape = aspect / math.pi - 0.142 * (1 - 10 ** (-aspect))
    w = (pack_l / 1000 / shape) ** (1 / 3)
    h = aspect * w
    area = 2 * w * h * 0.9
    solid_l = fill_kg / true_density
    headspace = max(pack_l - solid_l, 0.02 * pack_l)
    if vacuum:
        headspace = max(0.03 * pack_l, 0.002)
    return {
        "fillKg": fill_kg, "packVolumeL": pack_l, "flatWidthCm": w * 100 + 2, "flatLengthCm": h * 100 + 3,
        "permeableAreaM2": area, "headspaceL": headspace,
        "basis": "Pillow-pouch volume approximation with 15% fill allowance; 10% of film area assumed in seals.",
    }


def rigid_scale(structure: dict, fill_kg: float) -> float:
    ref = (structure.get("rigid") or {}).get("refSizeKg", 1)
    return (fill_kg / ref) ** (2 / 3)


def pack_geometry(structure: dict, fill_kg: float, bulk_density: float, true_density: float, vacuum: bool) -> dict:
    g = pouch_geometry(fill_kg, bulk_density, true_density, vacuum)
    if structure.get("rigid"):
        g["basis"] = "Rigid container: performance scaled from reference size by (size/ref)^(2/3)."
    return g


def film_mass_g(structure: dict, geom: dict, density_of) -> float:
    if structure.get("rigid"):
        return structure["rigid"]["massG"] * rigid_scale(structure, geom["fillKg"])
    total_area = (geom["flatWidthCm"] / 100) * (geom["flatLengthCm"] / 100) * 2 * (1.25 if structure["format"] == "stand-up-pouch" else 1)
    return sum(l["thicknessUm"] * 1e-6 * total_area * density_of(l["materialId"]) * 1e6 for l in structure["layers"])
