"""Gap 2 — translating protection requirements into structure and thickness.

Series-resistance laminate model 1/T_total = Σ 1/T_i; polymer layers scale inversely
with thickness, coatings/metallisation/foil are fixed; Arrhenius temperature dependence;
humidity-sensitive OTR interpolated between dry and humid values.
"""
from __future__ import annotations

import math

from .. import reference as ref
from .geometry import rigid_scale
from .physics import arrhenius, psat

WVTR_TEST = {"tC": 38, "rh": 90}
OTR_TEST = {"tC": 23, "rh": 0}
DP_WVTR_TEST = float(psat(WVTR_TEST["tC"]) * WVTR_TEST["rh"] / 100)
GENERIC_E_O2 = 35.0
GENERIC_E_H2O = 45.0


def _series(vals: list[float]) -> float:
    return math.inf if not vals else 1 / sum(1 / v for v in vals)


def _layer_otr(layer: dict, t_c: float, rh: float) -> float:
    m = ref.materials()[layer["materialId"]]
    base = m["otrRef"]
    if m.get("otrRefHighRh") is not None:
        f = min(max(rh / 80, 0), 1.25)
        base = m["otrRef"] + (m["otrRefHighRh"] - m["otrRef"]) * f
    thk = m["refThicknessUm"] / layer["thicknessUm"] if m["thicknessScalable"] else 1
    return base * thk * float(arrhenius(m["ePermO2kJ"], OTR_TEST["tC"], t_c))


def _layer_permeance(layer: dict, t_c: float) -> float:
    m = ref.materials()[layer["materialId"]]
    thk = m["refThicknessUm"] / layer["thicknessUm"] if m["thicknessScalable"] else 1
    return (m["wvtrRef"] / DP_WVTR_TEST) * thk * float(arrhenius(m["ePermH2OkJ"], WVTR_TEST["tC"], t_c))


def structure_barrier(s: dict, t_c: float, rh: float) -> dict:
    mid_rh = max(rh * 0.75, 40)
    mats = ref.materials()
    otrs = [_layer_otr(l, t_c, mid_rh) for l in s["layers"]]
    return {
        "otr": _series(otrs),
        "co2tr": _series([o * mats[l["materialId"]]["co2O2Ratio"] for o, l in zip(otrs, s["layers"])]),
        "permeanceH2O": _series([_layer_permeance(l, t_c) for l in s["layers"]]),
    }


def pack_transmission(s: dict, area_m2: float, fill_kg: float, t_c: float, rh: float) -> dict:
    if s.get("rigid"):
        k = rigid_scale(s, fill_kg)
        f_t = float(arrhenius(30, 23, t_c))
        r = s["rigid"]
        return {
            "o2": r["otrPerPackCcDay"] * k * f_t / 0.209,
            "h2o": r["wvtrPerPackGDay"] * k * float(arrhenius(40, 38, t_c)) / DP_WVTR_TEST,
            "co2": r["otrPerPackCcDay"] * k * f_t * 4 / 0.209,
        }
    b = structure_barrier(s, t_c, rh)
    return {"o2": b["otr"] * area_m2, "h2o": b["permeanceH2O"] * area_m2, "co2": b["co2tr"] * area_m2}


def structure_at_test(s: dict) -> dict:
    if s.get("rigid"):
        return {"otr": math.nan, "wvtr": math.nan}
    return {
        "otr": structure_barrier(s, OTR_TEST["tC"], 0)["otr"],
        "wvtr": structure_barrier(s, WVTR_TEST["tC"], WVTR_TEST["rh"])["permeanceH2O"] * DP_WVTR_TEST,
    }


def minimum_gauge(material_id: str, otr_req: float | None = None, wvtr_req: float | None = None) -> dict | None:
    m = ref.materials()[material_id]
    if not m["thicknessScalable"]:
        return None
    needed = 0.0
    if otr_req and otr_req > 0:
        needed = max(needed, m["otrRef"] * m["refThicknessUm"] / otr_req)
    if wvtr_req and wvtr_req > 0:
        needed = max(needed, m["wvtrRef"] * m["refThicknessUm"] / wvtr_req)
    gauge = next((g for g in ref.materials_data()["commonGaugesUm"] if g >= needed), None)
    return {"materialId": material_id, "exactUm": needed, "gaugeUm": gauge, "practical": gauge is not None and needed <= 200}


def describe_layers(s: dict) -> str:
    mats = ref.materials()
    return " / ".join(f'{mats[l["materialId"]]["commonName"]} {l["thicknessUm"]} µm' for l in s["layers"])


def recyclability(s: dict) -> dict:
    if s.get("rigid"):
        f = s["rigid"]["family"]
        return {
            "family": f,
            "label": {"metal": "Metal — widely collected", "glass": "Glass — recyclable / reusable", "PET": "PET rigid — collected in many cities"}.get(f, "Rigid plastic — reusable crate"),
            "pwmCategory": "Not plastic (outside PWM categories)" if f in ("metal", "glass") else "Category I (rigid plastic)",
            "score": {"PP": 0.9, "glass": 0.8, "metal": 0.8}.get(f, 0.7),
        }
    mats = ref.materials()
    fams = {mats[l["materialId"]]["family"] for l in s["layers"]}
    weight = lambda l: l["thicknessUm"] * mats[l["materialId"]]["densityGcc"]  # noqa: E731
    total = sum(weight(l) for l in s["layers"])
    pe = sum(weight(l) for l in s["layers"] if mats[l["materialId"]]["family"] == "PE")
    non_plastic = bool(fams & {"metal", "paper"})
    if len(fams) == 1 and fams & {"PE", "PP"}:
        f = next(iter(fams))
        return {"family": f, "label": f"Mono-material {f} — recyclable where flexible-film collection exists", "pwmCategory": "Category II (flexible plastic)", "score": 0.75}
    if fams == {"compostable"}:
        return {"family": "compostable", "label": "Compostable — only under suitable (usually industrial) composting", "pwmCategory": "Category IV (compostable plastic)", "score": 0.55}
    if pe / total >= 0.9 and not non_plastic:
        return {"family": "PE", "label": "PE-based design for recycling (minor EVOH layer) — verify with local recycler", "pwmCategory": "Category II (flexible plastic)", "score": 0.6}
    if non_plastic:
        return {"family": "multi-material", "label": "Multi-layer with metal/paper — not mechanically recyclable in common streams", "pwmCategory": "Category III (multilayered plastic)", "score": 0.15}
    return {"family": "mixed-plastic", "label": "Mixed plastics laminate — limited recyclability", "pwmCategory": "Category II (flexible plastic)", "score": 0.3}
