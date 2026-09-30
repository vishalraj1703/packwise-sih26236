"""Gap 3 — Modified Atmosphere Packaging and micro-perforation.

Steady state per gas: G·(y_out − y_in) = R(y_in)·W, with G = OTR·A + n·K_hole.
Respiration uses Q10 temperature dependence and Michaelis–Menten O2 dependence;
per-hole conductance K = D·πr²/(L + r)·273.15/T (Fishman). Equilibria are solved with
scipy.optimize.brentq; the post-sealing headspace transient with scipy.integrate.solve_ivp;
uncertainty with a 400-sample NumPy Monte Carlo.
"""
from __future__ import annotations

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

from .physics import AIR_CO2, AIR_O2, rng, summarize, triangular_inv, lo, hi

MG_CO2_TO_ML = 22.414 / 44.01
HOLE_DIAMETERS_UM = [60, 90, 120, 200]


def respiration_o2(y: float, t_c: float, p: dict) -> float:
    """O2 consumption, mL(STP)/(kg·day)."""
    rco2_air = p["rco2At20"] * p["q10"] ** ((t_c - 20) / 10) * MG_CO2_TO_ML * 24
    ro2_air = rco2_air / p["rq"]
    yy = max(y, 0.0)
    return ro2_air * (yy / (p["km"] + yy)) * ((p["km"] + AIR_O2) / AIR_O2)


def hole_conductance(diameter_um: float, film_um: float, t_c: float, gas: str) -> float:
    tk = t_c + 273.15
    d = (0.2 if gas == "O2" else 0.16) * (tk / 293.15) ** 1.75
    r = diameter_um / 2 * 1e-4
    length = film_um * 1e-4
    return d * np.pi * r * r / (length + r) * (273.15 / tk) * 86400


def equilibrium(g: dict, fill_kg: float, t_c: float, p: dict) -> dict:
    f = lambda y: g["gO2"] * (AIR_O2 - y) - respiration_o2(y, t_c, p) * fill_kg  # noqa: E731
    if f(1e-6) <= 0:
        o2 = 0.0
    else:
        o2 = brentq(f, 1e-6, AIR_O2, xtol=1e-7)
    co2 = AIR_CO2 + p["rq"] * respiration_o2(max(o2, 1e-6), t_c, p) * fill_kg / g["gCO2"]
    return {"o2": float(o2), "co2": float(min(co2, 0.99))}


def pct(y: float) -> str:
    return f"{y * 100:.1f}%"


def _in_window(e: dict, r: dict) -> bool:
    return r["targetO2"][0] - 0.005 <= e["o2"] <= r["targetO2"][1] + 0.005 and e["co2"] <= r["maxCo2"]


def simulate_transient(cond, fill_kg: float, free_volume_l: float, profile: list[dict], p: dict) -> dict:
    v = max(free_volume_l, 0.05) * 1000
    y = np.array([AIR_O2, AIR_CO2])
    t0 = 0.0
    trace = [{"day": 0.0, "o2": AIR_O2, "co2": AIR_CO2}]
    days_to_eq = None
    for seg in profile:
        g = cond(seg["tC"])

        def rhs(_t, s, g=g, t_c=seg["tC"]):
            o2, co2 = max(s[0], 0.0), max(s[1], 0.0)
            r = respiration_o2(o2, t_c, p) * fill_kg
            return [(g["gO2"] * (AIR_O2 - o2) - r) / v, (g["gCO2"] * (AIR_CO2 - co2) + p["rq"] * r) / v]

        n_eval = max(4, int(min(40, seg["days"] * 8)))
        t_eval = np.linspace(t0, t0 + seg["days"], n_eval + 1)[1:]
        sol = solve_ivp(rhs, (t0, t0 + seg["days"]), y, method="LSODA", t_eval=t_eval, max_step=0.05)
        for t, o2, co2 in zip(sol.t, sol.y[0], sol.y[1]):
            o2c, co2c = float(min(max(o2, 0), AIR_O2)), float(min(max(co2, 0), 0.99))
            if days_to_eq is None and t > 0.1 and abs(rhs(t, [o2c, co2c])[0]) < 0.0005:
                days_to_eq = float(t)
            trace.append({"day": float(t), "o2": o2c, "co2": co2c})
        y = np.array([trace[-1]["o2"], trace[-1]["co2"]])
        t0 += seg["days"]
    return {"trace": trace, "daysToEq": days_to_eq}


def design_map(c: dict, fill_kg: float, film_um: float, film_o2_at, beta: float, free_volume_l: float,
               profile: list[dict], storage_t_c: float, mc_samples: int = 400) -> dict:
    r = c["respiration"]
    p = {"rco2At20": r["rco2At20"]["value"], "q10": r["q10"]["value"], "rq": r["rq"]["value"], "km": r["kmO2"]["value"]}
    y_t = (r["targetO2"][0] + r["targetO2"][1]) / 2
    need = respiration_o2(y_t, storage_t_c, p) * fill_kg / (AIR_O2 - y_t)
    film = film_o2_at(storage_t_c)
    best = None
    reason = ""
    if film > need * 1.05:
        reason = (f"Film alone admits too much oxygen ({film:.0f} vs {need:.0f} mL/day·atm needed): O₂ cannot fall into the "
                  f"{pct(r['targetO2'][0])}–{pct(r['targetO2'][1])} window. Use a lower-permeability film or a larger fill.")
    else:
        for d in HOLE_DIAMETERS_UM:
            k = hole_conductance(d, film_um, storage_t_c, "O2")
            n = max(0, round((need - film) / k))
            if n <= 60:
                best = (d, n)
                break
        if not best:
            reason = "Required gas exchange needs more than 60 perforations of 200 µm — use a more permeable film or macro-perforation / vented pack."
    holes = best[1] if best else 0
    d = best[0] if best else HOLE_DIAMETERS_UM[0]

    def cond(t_c, jf=1.0, jh=1.0):
        fo = film_o2_at(t_c) * jf
        return {"gO2": fo + hole_conductance(d * jh, film_um, t_c, "O2") * holes,
                "gCO2": fo * beta + hole_conductance(d * jh, film_um, t_c, "CO2") * holes}

    eq_store = equilibrium(cond(storage_t_c), fill_kg, storage_t_c, p)
    by_segment = []
    for s in profile:
        e = equilibrium(cond(s["tC"]), fill_kg, s["tC"], p)
        by_segment.append({"label": s["label"], "tC": s["tC"], "o2": e["o2"], "co2": e["co2"], "inWindow": _in_window(e, r), "anaerobic": e["o2"] < r["minO2"]})

    g = rng(1234)
    n = mc_samples
    u = g.uniforms(7 * n).reshape(n, 7)  # same draw order as the web engine
    rc = triangular_inv(u[:, 0], lo(r["rco2At20"]), r["rco2At20"]["value"], hi(r["rco2At20"]))
    q10 = triangular_inv(u[:, 1], lo(r["q10"]), r["q10"]["value"], hi(r["q10"]))
    rq = triangular_inv(u[:, 2], lo(r["rq"]), r["rq"]["value"], hi(r["rq"]))
    km = triangular_inv(u[:, 3], lo(r["kmO2"]), r["kmO2"]["value"], hi(r["kmO2"]))
    dt = triangular_inv(u[:, 4], -2, 0, 2)
    jf = triangular_inv(u[:, 5], 0.85, 1, 1.15)
    jh = triangular_inv(u[:, 6], 0.9, 1, 1.1)
    o2s, co2s = np.empty(n), np.empty(n)
    for i in range(n):
        t_c = storage_t_c + dt[i]
        e = equilibrium(cond(t_c, jf[i], jh[i]), fill_kg, t_c, {"rco2At20": rc[i], "q10": q10[i], "rq": rq[i], "km": km[i]})
        o2s[i], co2s[i] = e["o2"], e["co2"]
    in_w = float(np.mean((o2s >= r["targetO2"][0] - 0.005) & (o2s <= r["targetO2"][1] + 0.005) & (co2s <= r["maxCo2"])))
    anaer = float(np.mean(o2s < r["minO2"]))
    inj = float(np.mean(co2s > r["maxCo2"]))

    kh = hole_conductance(d, film_um, storage_t_c, "O2")
    need_at = lambda rcv: respiration_o2(y_t, storage_t_c, {**p, "rco2At20": rcv}) * fill_kg / (AIR_O2 - y_t)  # noqa: E731
    holes_range = [max(0, round((need_at(lo(r["rco2At20"])) - film) / kh)), max(0, round((need_at(hi(r["rco2At20"])) - film) / kh))]
    tr = simulate_transient(cond, fill_kg, free_volume_l, profile, p)
    probability = {"inWindow": in_w, "anaerobic": anaer, "co2Injury": inj, "samples": n}
    feasible = bool(best) and anaer < 0.05 and in_w >= 0.5 and all(not s["anaerobic"] for s in by_segment)
    if best and not feasible:
        bad = next((s for s in by_segment if s["anaerobic"]), None)
        reason = (f'At {bad["tC"]:.0f} °C during "{bad["label"]}" respiration outpaces gas exchange and O₂ falls to {pct(bad["o2"])} — anaerobic risk. Reduce transit temperature or add perforations.'
                  if bad else f"Only {in_w * 100:.0f}% of simulated cases stay inside the target window (anaerobic risk {anaer * 100:.0f}%).")
    elif feasible:
        reason = f"{holes} × {d} µm perforations bring O₂ to ≈{pct(eq_store['o2'])} and CO₂ to ≈{pct(eq_store['co2'])} at {storage_t_c} °C."
    return {
        "feasible": feasible, "reason": reason, "holeDiameterUm": d if best else None, "holes": holes, "holesRange": holes_range,
        "equilibriumAtStorage": eq_store, "bySegment": by_segment, "probability": probability,
        "o2Dist": summarize(o2s), "co2Dist": summarize(co2s), "transient": tr["trace"], "daysToEquilibrium": tr["daysToEq"],
    }
