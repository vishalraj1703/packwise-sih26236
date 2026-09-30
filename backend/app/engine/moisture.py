"""Gap 1 (moisture) — required WVTR for a dry food over the full exposure profile.

Labuza model with a linear isotherm M = a + b·aw (dry basis). With constant conditions
  M(t) = Me − (Me − M0)·exp(−k·t),  k = P'·A·p0(T) / (Ws·b),  Me = a + b·RH,
applied piecewise. The required WVTR (at 38 °C / 90 % RH) is found with SciPy's brentq.
"""
from __future__ import annotations

import math
from typing import Callable

from scipy.optimize import brentq

from .barrier import DP_WVTR_TEST, GENERIC_E_H2O, WVTR_TEST
from .physics import arrhenius, psat, wb_to_db


def moisture_trajectory(inp: dict, profile: list[dict], conductance_at: Callable[[float, float], float], steps: int = 8) -> dict:
    solids_g = inp["fillKg"] * 1000 * (1 - inp["initialWb"] / 100)
    mc = wb_to_db(inp["criticalWb"])
    m = wb_to_db(inp["initialWb"])
    trace = [{"day": 0.0, "moistureWb": inp["initialWb"]}]
    gaining = inp.get("direction", "gain") == "gain"
    total = sum(s["days"] for s in profile)
    if (gaining and m >= mc) or (not gaining and m <= mc):
        return {"trace": trace, "finalWb": inp["initialWb"], "criticalDay": 0.0, "criticalDayExtended": 0.0, "extrapolated": False, "totalDays": total}
    day = 0.0
    critical_day = None
    extrapolated = False
    iso_lo, iso_hi = inp["isoRange"]
    for seg in profile:
        me = inp["isoA"] + inp["isoB"] * seg["rhPct"] / 100
        if seg["rhPct"] / 100 > iso_hi + 0.05 or seg["rhPct"] / 100 < iso_lo - 0.05:
            extrapolated = True
        k = conductance_at(seg["tC"], seg["rhPct"]) * float(psat(seg["tC"])) / (solids_g * inp["isoB"])
        m0 = m
        if critical_day is None and ((gaining and me > mc and m0 < mc) or (not gaining and me < mc and m0 > mc)):
            t = math.log((me - m0) / (me - mc)) / k
            if t <= seg["days"]:
                critical_day = day + t
        for i in range(1, steps + 1):
            t = seg["days"] * i / steps
            mt = me - (me - m0) * math.exp(-k * t)
            trace.append({"day": day + t, "moistureWb": 100 * mt / (1 + mt)})
        m = me - (me - m0) * math.exp(-k * seg["days"])
        day += seg["days"]
    if critical_day is None and ((gaining and m >= mc) or (not gaining and m <= mc)):
        critical_day = day
    extended = critical_day
    if critical_day is None and profile:
        last = profile[-1]
        me = inp["isoA"] + inp["isoB"] * last["rhPct"] / 100
        k = conductance_at(last["tC"], last["rhPct"]) * float(psat(last["tC"])) / (solids_g * inp["isoB"])
        if (gaining and me > mc) or (not gaining and me < mc):
            extended = day + math.log((me - m) / (me - mc)) / k
        else:
            extended = math.inf
    return {"trace": trace, "finalWb": 100 * m / (1 + m), "criticalDay": critical_day, "criticalDayExtended": extended, "extrapolated": extrapolated, "totalDays": day}


def required_wvtr(inp: dict, profile: list[dict]) -> dict:
    """Highest WVTR at 38 °C/90 % RH that keeps moisture below the limit for the whole profile."""
    def conductance(wvtr_test: float):
        return lambda t_c, rh=None: (wvtr_test / DP_WVTR_TEST) * float(arrhenius(GENERIC_E_H2O, WVTR_TEST["tC"], t_c)) * inp["areaM2"]

    def margin(log_w: float) -> float:
        r = moisture_trajectory(inp, profile, conductance(math.exp(log_w)), 1)
        # positive when the limit is not reached within the profile
        return 1.0 if r["criticalDay"] is None else -1.0 + r["criticalDay"] / max(r["totalDays"], 1e-9)

    lo_w, hi_w = math.log(1e-6), math.log(1e6)
    if margin(hi_w) > 0:
        return {"wvtrTest": math.inf, "alwaysOk": True, "neverOk": False}
    if margin(lo_w) <= 0:
        return {"wvtrTest": 0.0, "alwaysOk": False, "neverOk": True}
    root = brentq(lambda x: 1.0 if margin(x) > 0 else -1.0, lo_w, hi_w, xtol=1e-6, maxiter=200)
    return {"wvtrTest": math.exp(root), "alwaysOk": False, "neverOk": False}
