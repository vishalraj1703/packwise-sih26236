"""Gap 1 (oxygen) — required OTR from an oxygen budget, headspace O2 and oxygen-control sizing."""
from __future__ import annotations

import math

from .barrier import GENERIC_E_O2, OTR_TEST
from .physics import AIR_O2, O2_MG_PER_CC_STP, arrhenius

RESIDUAL_O2 = {"none": AIR_O2, "vacuum": 0.01, "gas-flush": 0.02, "absorber": 0.001}
ABSORBER_SIZES_CC = [20, 30, 50, 100, 200, 300, 500, 1000, 2000]


def headspace_o2_mg(headspace_l: float, residual: float, t_c: float = 25) -> float:
    return headspace_l * residual * (1 / (0.08206 * (t_c + 273.15))) * 32000


def oxygen_ingress_mg(profile: list[dict], o2_cc_per_day_atm_at, inside_o2: float = 0) -> float:
    return sum(o2_cc_per_day_atm_at(s["tC"], s["rhPct"]) * (AIR_O2 - inside_o2) * s["days"] * O2_MG_PER_CC_STP for s in profile)


def required_otr(tolerance_mg_per_kg: float, fill_kg: float, area_m2: float, profile: list[dict]) -> float:
    budget = tolerance_mg_per_kg * fill_kg
    denom = sum(area_m2 * AIR_O2 * s["days"] * O2_MG_PER_CC_STP * float(arrhenius(GENERIC_E_O2, OTR_TEST["tC"], s["tC"])) for s in profile)
    return budget / denom if denom > 0 else math.inf


def size_absorber(headspace_l: float, ingress_mg: float, safety: float = 1.3) -> dict:
    needed = (headspace_l * 1000 * AIR_O2 + ingress_mg / O2_MG_PER_CC_STP) * safety
    size = next((s for s in ABSORBER_SIZES_CC if s >= needed), None)
    return {"neededCc": needed, "sachetCc": size, "sachets": 1 if size else math.ceil(needed / ABSORBER_SIZES_CC[-1])}
