"""Gap 4 — sealing, equipment compatibility and mechanical performance.

Numerical acceptance limits are proposed defaults flagged for expert confirmation.
"""
from __future__ import annotations

import math

from .. import reference as ref

EQUIPMENT = {
    "heat-impulse": {"label": "Hand impulse sealer", "rangeC": [100, 200], "note": "Low-cost; seal width usually 2–5 mm."},
    "band-sealer": {"label": "Continuous band sealer", "rangeC": [100, 250], "note": "Faster, consistent 8–10 mm seals."},
    "vacuum-chamber": {"label": "Vacuum chamber machine", "rangeC": [100, 200], "note": "Removes headspace air before sealing."},
    "vacuum-gas-flush": {"label": "Vacuum + gas-flush machine", "rangeC": [100, 200], "note": "Replaces air with N₂/CO₂."},
    "tray-sealer": {"label": "Tray sealer", "rangeC": [120, 200], "note": "Lidding film on rigid trays."},
    "can-seamer": {"label": "Can seamer", "note": "Double-seam for metal cans."},
    "sack-stitch": {"label": "Bag-closing (stitching) machine", "note": "Closes woven sacks; liner is sealed or tied separately."},
    "screw-cap": {"label": "Screw / lug cap (manual)", "note": "Torque-controlled closure."},
    "clip-tie": {"label": "Clip / twist-tie", "note": "Not hermetic — suitable only where a barrier seal is not required."},
    "none": {"label": "No closure (open crate)", "note": "Ventilated packing."},
}
HERMETIC = {"heat-impulse", "band-sealer", "vacuum-chamber", "vacuum-gas-flush", "tray-sealer", "can-seamer", "screw-cap"}
MANUAL = {"screw-cap", "clip-tie", "none"}


def _sealant(s: dict):
    if not s["layers"]:
        return None
    return ref.materials()[s["layers"][-1]["materialId"]].get("sealant")


def seal_compatibility(s: dict, owned: list[str], needs: dict, service_methods: list[str]) -> dict:
    """A pack is only offered if it can be closed with owned equipment or a matched packing service."""

    def required(m: str) -> bool:
        if needs["vacuum"] and m not in ("vacuum-chamber", "vacuum-gas-flush", "can-seamer"):
            return False
        if needs["gasFlush"] and m not in ("vacuum-gas-flush", "can-seamer"):
            return False
        if needs["hermetic"] and m not in HERMETIC and m != "sack-stitch":
            return False
        return True

    sealant = _sealant(s)

    def temp_ok(m: str) -> bool:
        rng = EQUIPMENT[m].get("rangeC")
        if not rng or not sealant:
            return True
        return rng[0] - 5 <= sealant["minC"] <= rng[1]

    cands = [m for m in s["sealMethods"] if required(m) and temp_ok(m)]
    own = next((m for m in cands if m in owned or m in MANUAL), None)
    if own:
        return {"compatible": True, "method": own, "viaService": False, "reasons": [f"Closes with your {EQUIPMENT[own]['label'].lower()}."]}
    svc = next((m for m in cands if m in service_methods), None)
    if svc:
        return {"compatible": True, "method": svc, "viaService": True,
                "reasons": [f"You do not own suitable equipment; a packing service with a {EQUIPMENT[svc]['label'].lower()} is required."]}
    if not cands:
        reasons = ["No closure method for this structure meets the protection need (e.g. vacuum/gas flush or hermetic seal)."]
    else:
        reasons = [f"Needs {' or '.join(EQUIPMENT[m]['label'].lower() for m in cands)}, which is neither owned nor offered by a matched packing service."]
    return {"compatible": False, "method": None, "viaService": False, "reasons": reasons}


def zero_acceptance_sample(lot_size: int, confidence: float = 0.95, max_defect_rate: float = 0.05) -> int:
    """c = 0 attribute sampling: n = ln(1 − C) / ln(1 − p), capped at the lot size."""
    return min(math.ceil(math.log(1 - confidence) / math.log(1 - max_defect_rate)), lot_size)


def seal_specification(s: dict, c: dict, fill_kg: float, method: str, units: int, map_or_vacuum: bool, is_vacuum: bool = False) -> dict:
    sealant = _sealant(s)
    strength = 10 if fill_kg <= 0.5 else 15 if fill_kg <= 2 else 20  # N/15 mm — proposed default
    width = (5 if method == "heat-impulse" else 8) if fill_kg <= 1 else 10
    seals = []
    if method == "can-seamer":
        seals.append({"test": "Double-seam teardown & measurement", "standard": "Can-maker specification", "acceptance": "Seam dimensions within can-maker limits; no vacuum loss after 24 h", "sourceId": "SEED"})
    elif method == "screw-cap":
        seals.append({"test": "Closure torque and leak check (inverted 1 h)", "standard": "Closure supplier specification", "acceptance": "Application torque within supplier range; no leakage", "sourceId": "SEED"})
    elif method not in ("none", "clip-tie", "sack-stitch"):
        seals.append({"test": "Seal strength (peel)", "standard": "ASTM F88", "acceptance": f"≥ {strength} N/15 mm, no seal-area delamination", "sourceId": "ASTM-F88"})
        seals.append({"test": "Gross leak (bubble)", "standard": "ASTM F2096", "acceptance": "No continuous bubble stream from any sample", "sourceId": "ASTM-F2096"})
        if map_or_vacuum or fill_kg >= 2:
            seals.append({"test": "Burst / internal pressurisation", "standard": "ASTM F1140", "acceptance": "Failure outside the seal area, or above the agreed burst pressure", "sourceId": "ASTM-F1140"})
        seals.append({"test": "Visual seal check", "standard": "Packing guide", "acceptance": "Continuous, uniform, no wrinkles, channels or product in seal", "sourceId": "SEED"})
    puncture_note = None
    mats = ref.materials()
    puncture = sum(mats[l["materialId"]]["punctureIndex"] * l["thicknessUm"] / 25 for l in s["layers"])
    if c["mechanical"]["sharpEdges"] or is_vacuum:
        what = "sharp-edged product" if c["mechanical"]["sharpEdges"] else "vacuum packing"
        puncture_note = (f"Low puncture resistance (index {puncture:.1f}) for {what} — prefer a structure with a nylon (BOPA) layer." if puncture < 4
                         else f"Puncture resistance index {puncture:.1f} — adequate for vacuum packing (verify with a puncture test on filled packs).")
    return {
        "method": method, "sealTempC": [sealant["minC"], sealant["maxC"]] if sealant else None, "sealWidthMm": width, "seals": seals,
        "punctureNote": puncture_note, "proposed": True,
        "sampling": {"lotSize": units, "sampleSize": zero_acceptance_sample(units), "confidence": 0.95, "maxDefectRate": 0.05,
                     "rule": "c = 0: accept the lot only if no sample fails"},
    }


BOARD_GRADES = [
    {"id": "3ply", "name": "3-ply corrugated (single wall)", "ectNPerM": 4500, "caliperMm": 3.5, "pricePerM2Inr": 32},
    {"id": "5ply", "name": "5-ply corrugated (double wall)", "ectNPerM": 7800, "caliperMm": 6.5, "pricePerM2Inr": 55},
    {"id": "7ply", "name": "7-ply corrugated (triple wall)", "ectNPerM": 11500, "caliperMm": 9.5, "pricePerM2Inr": 85},
]
CRATES = [
    {"id": "crate-20", "name": "Ventilated plastic crate (≈20 kg)", "capacityKg": 20, "priceInr": 25, "reusable": True},
    {"id": "cfb-10", "name": "Ventilated CFB box (≈10 kg, 5-ply)", "capacityKg": 10, "priceInr": 38, "reusable": False},
]


def stacking_safety_factor(storage_days: float, rh: float, aligned: bool) -> dict:
    """Commonly cited environmental derating factors (reference estimates)."""
    time = 0.63 if storage_days <= 10 else 0.6 if storage_days <= 30 else 0.55 if storage_days <= 90 else 0.5
    hum = 1 if rh <= 50 else 0.9 if rh <= 60 else 0.8 if rh <= 70 else 0.68 if rh <= 80 else 0.48
    pattern = 0.9 if aligned else 0.55
    handling = 0.9
    combined = time * hum * pattern * handling
    return {"time": time, "hum": hum, "pattern": pattern, "handling": handling, "combined": combined, "safetyFactor": 1 / combined}


def mckee_bct(ect: float, caliper_mm: float, perimeter_m: float) -> float:
    """McKee: BCT ≈ 5.874 · ECT · √(caliper · perimeter)."""
    return 5.874 * ect * math.sqrt(caliper_mm / 1000 * perimeter_m)


def ista_drop_height_cm(gross_kg: float) -> int:
    if gross_kg < 9.5:
        return 76
    if gross_kg < 18.6:
        return 61
    if gross_kg < 27.7:
        return 46
    if gross_kg < 45.4:
        return 30
    return 20


def plan_cartons(unit_fill_kg: float, unit_dims: dict, total_units: int, stack_height_m: float, storage_days: float, rh: float) -> dict:
    unit_gross = unit_fill_kg * 1.04
    per = max(1, min(total_units, math.floor(20 / unit_gross)))
    across = max(1, round(math.sqrt(per / 2)))
    layers = max(1, math.ceil(per / (across * 2)))
    dims = [unit_dims["w"] * across + 2, unit_dims["l"] + 2, unit_dims["t"] * layers + 2]
    cartons = math.ceil(total_units / per)
    gross = per * unit_gross + 0.6
    stack_layers = max(1, math.floor(stack_height_m * 100 / dims[2]))
    load = (stack_layers - 1) * gross * 9.81
    factors = stacking_safety_factor(storage_days, rh, True)
    required = load * factors["safetyFactor"]
    perimeter = 2 * (dims[0] + dims[1]) / 100
    grade, bct = None, 0.0
    for g in BOARD_GRADES:
        bct = mckee_bct(g["ectNPerM"], g["caliperMm"], perimeter)
        if bct >= required:
            grade = g
            break
    area = 2 * (dims[0] * dims[1] + dims[1] * dims[2] + dims[0] * dims[2]) / 10000
    g = grade or BOARD_GRADES[-1]
    return {
        "unitsPerCarton": per, "cartons": cartons, "cartonGrossKg": gross, "dimsCm": dims, "stackLayers": stack_layers,
        "requiredBctN": required, "grade": grade, "bctN": bct if grade else mckee_bct(g["ectNPerM"], g["caliperMm"], perimeter),
        "factors": factors, "dropHeightCm": ista_drop_height_cm(gross), "costPerCartonInr": area * g["pricePerM2Inr"] * 1.15,
        "note": "" if grade else "Even 7-ply board does not meet the stacking requirement — reduce stack height or use pallets/racking.",
    }
