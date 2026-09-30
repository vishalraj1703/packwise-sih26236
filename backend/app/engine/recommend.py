"""Recommendation sequence (discussion record p.4):

check inputs → identify protection needs → exclude incompatible options →
match documented materials → evaluate supported performance →
compare feasible costs and trade-offs → explain.

Output keys are camelCase so the web dashboard and the Flutter app consume the same JSON.
"""
from __future__ import annotations

import itertools
import math
from datetime import datetime, timezone

import numpy as np

from .. import reference as ref
from .barrier import describe_layers, minimum_gauge, pack_transmission, recyclability, structure_at_test
from .cost import DEFAULT_COST_SETTINGS, aggregate_order_cost, standalone_cost
from .geometry import film_mass_g, pack_geometry
from .journey import storage_segment, transit_segments, transport_options
from .map import design_map, pct, respiration_o2
from .moisture import moisture_trajectory, required_wvtr
from .oxygen import RESIDUAL_O2, headspace_o2_mg, oxygen_ingress_mg, required_otr, size_absorber
from .physics import hi, lo, psat, rng, sig, summarize, triangular, triangular_inv, wb_to_db
from .sealing import CRATES, EQUIPMENT, plan_cartons, seal_compatibility, seal_specification

ENGINE_VERSION = "packwise-engine 2.0.0 (Python/NumPy/SciPy, 2026-10-01)"
DELAY_SCENARIO = {"extraHours": 48, "extraC": 4}
OXIDATION_THRESHOLD_DAYS = 30  # open parameter of Gap 1, pending expert review
TAG_LABEL = {"lowest-cost": "Lowest evaluated cost", "faster": "Faster delivery", "delay-tolerant": "Greater tolerance for delays", "sustainable": "Sustainable alternative"}
PROMISE = "For each recommendation we show why it fits, what evidence supports it, what conditions it requires and what still needs checking."


def num(x) -> str:
    """Format a number the way JavaScript's String(x) does (1 → '1', 0.5 → '0.5')."""
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return str(x)


def fmt_ev(e: dict) -> str:
    rng_txt = f' ({num(e["lo"])}–{num(e["hi"])})' if e.get("lo") is not None and e.get("hi") is not None and (e["lo"] != e["value"] or e["hi"] != e["value"]) else ""
    return f'{num(e["value"])}{rng_txt} {e["unit"]}'


def fmt_days(d: float) -> str:
    return "no limit reached" if d >= 1e5 else "more than 10 years" if d > 3650 else f"{round(d)} days"


def inr_fmt(x: float) -> str:
    """Indian digit grouping (e.g. 1,23,456)."""
    s = str(round(x))
    neg = s.startswith("-")
    s = s.lstrip("-")
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return ("-" if neg else "") + s


def _services(user_state: str | None) -> list[dict]:
    return [s for s in ref.suppliers() if s.get("packingService") and ("all-india" in s["deliversTo"] or not user_state or user_state in s["deliversTo"])]


def _products_for(structure_id: str, size, user_state: str | None) -> list[dict]:
    out = []
    for p in ref.supplier_products():
        if p["structureId"] != structure_id or size not in p["sizesKg"]:
            continue
        s = ref.get_supplier(p["supplierId"])
        if "all-india" in s["deliversTo"] or not user_state or user_state in s["deliversTo"]:
            out.append(p)
    return out


def _candidate_sizes(s: dict, portion: dict, c: dict) -> list:
    if c["foodClass"] == "fresh" and s["format"] == "crate":
        return [x for x in s["sizesKg"] if x <= max(portion["kg"], s["sizesKg"][0])]
    if portion.get("packSizeKg"):
        ps = portion["packSizeKg"]
        match = next((x for x in s["sizesKg"] if abs(x - ps) < 1e-9), None)
        return [match] if match is not None else []
    if portion["use"] == "retail":
        return [x for x in s["sizesKg"] if 0.25 <= x <= 1 and x <= portion["kg"]]
    bulk = [x for x in s["sizesKg"] if 5 <= x <= portion["kg"]]
    if not bulk:
        return []
    small = [x for x in bulk if x <= 25]
    out = ([max(small)] if small else []) + [x for x in bulk if x > 25]
    return list(dict.fromkeys(out))


def _fragile(c: dict) -> bool:
    return c["mechanical"]["crushable"] and c["mechanical"]["fragility"] == "high"


def _oxygen_controls(c: dict, s: dict, target_days: float) -> list[str]:
    if not c.get("oxygen"):
        return ["none"]
    if s["id"] == "tin-can":
        return ["gas-flush", "vacuum"]
    out = ["none"]
    if "vacuum-gas-flush" in s["sealMethods"]:
        out.append("gas-flush")
    if ("vacuum-chamber" in s["sealMethods"] or s["format"] == "vacuum-pack") and not _fragile(c):
        out.append("vacuum")
    if target_days > 30 and not s.get("rigid") and any(m in ("heat-impulse", "band-sealer") for m in s["sealMethods"]):
        out.append("absorber")
    return out


def _labour_minutes(s: dict, control: str, units: int, fill_kg: float) -> float:
    if s.get("rigid"):
        per = 2.5 if s["id"] == "tin-can" else 2 if s["id"] == "open-crate" else 0.8
    else:
        per = 3 if s["kind"] == "bulk-liner" else 0.5
    if control in ("vacuum", "gas-flush"):
        per += 0.6
    if control == "absorber":
        per += 0.2
    per += fill_kg * 0.05
    return per * units


def _resp_params(c: dict) -> dict:
    r = c["respiration"]
    return {"rco2At20": r["rco2At20"]["value"], "q10": r["q10"]["value"], "rq": r["rq"]["value"], "km": r["kmO2"]["value"]}


def _fresh_life(c: dict, profile: list[dict]) -> dict:
    """Relative rate of deterioration: equivalent days at the optimum temperature."""
    r = c["respiration"]
    t_opt = (r["storageTempC"][0] + r["storageTempC"][1]) / 2
    p = _resp_params(c)
    r_opt = respiration_o2(0.209, t_opt, p)
    d_opt = (r["maxStorageDaysAtOptimum"][0] + r["maxStorageDaysAtOptimum"][1]) / 2
    rel = sum(s["days"] * respiration_o2(0.209, s["tC"], p) / r_opt for s in profile)
    chilling = r.get("chillingInjuryBelowC") is not None and any(s["tC"] < r["chillingInjuryBelowC"] for s in profile)
    return {"consumed": rel / d_opt, "consumedOptimistic": rel / r["maxStorageDaysAtOptimum"][1],
            "consumedConservative": rel / r["maxStorageDaysAtOptimum"][0], "chilling": chilling, "dOpt": d_opt, "tOpt": t_opt}


def _moisture_days_mc(mi, mc, a, b, fvar, area, fill_kg, profile, h2o_by_seg, gaining=True) -> np.ndarray:
    """Vectorised Labuza model: days to reach the critical moisture for N sampled input sets."""
    m = mi / (100 - mi)
    mcd = mc / (100 - mc)
    solids = fill_kg * 1000 * (1 - mi / 100)
    n = m.size
    crit = np.full(n, np.nan)
    already = (m >= mcd) if gaining else (m <= mcd)
    crit[already] = 0.0
    day = 0.0
    for seg, g_h2o in zip(profile, h2o_by_seg):
        me = a + b * seg["rhPct"] / 100
        k = g_h2o * fvar * psat(seg["tC"]) / (solids * b)
        cross = np.isnan(crit) & ((me > mcd) & (m < mcd) if gaining else (me < mcd) & (m > mcd))
        with np.errstate(divide="ignore", invalid="ignore"):
            t = np.log((me - m) / (me - mcd)) / k
        hit = cross & (t <= seg["days"])
        crit[hit] = day + t[hit]
        m = me - (me - m) * np.exp(-k * seg["days"])
        day += seg["days"]
    last = profile[-1]
    me = a + b * last["rhPct"] / 100
    k = h2o_by_seg[-1] * fvar * psat(last["tC"]) / (solids * b)
    pending = np.isnan(crit)
    reached = pending & ((m >= mcd) if gaining else (m <= mcd))
    crit[reached] = day
    pending = np.isnan(crit)
    can = pending & ((me > mcd) if gaining else (me < mcd))
    with np.errstate(divide="ignore", invalid="ignore"):
        ext = day + np.log((me - m) / (me - mcd)) / k
    crit[can] = ext[can]
    crit[np.isnan(crit)] = np.inf
    return crit


def recommend(inp: dict) -> dict:
    c = ref.get_commodity(inp["commodityId"])
    settings = {**DEFAULT_COST_SETTINGS, **(inp.get("costSettings") or {})}
    total_kg = sum(p["kg"] for p in inp["portions"])
    reefer = ((c["respiration"]["storageTempC"][0] + c["respiration"]["storageTempC"][1]) / 2 if c.get("respiration")
              else 4 if c["foodClass"] == "chilled-perishable" else None)
    t_opts = transport_options(inp["journey"], total_kg, reefer)
    warnings = list(inp["journey"].get("warnings", []))
    if not inp["identification"]["confirmed"]:
        warnings.append("Food identity has not been confirmed by the user — confirm before relying on the result.")
    if c["review"] == "unreviewed-seed":
        warnings.append(f'Commodity data for {c["name"]} are unreviewed seed/reference values. Expert review is pending; treat results as screening, not as a specification.')
    portions = [_evaluate_portion(c, p, inp, t_opts) for p in inp["portions"]]
    plans = _build_plans(portions, t_opts, inp, settings)
    return {
        "engineVersion": ENGINE_VERSION, "createdAt": datetime.now(timezone.utc).isoformat(),
        "commodity": {"id": c["id"], "name": c["name"], "foodClass": c["foodClass"], "review": c["review"]},
        "input": inp, "transportOptions": t_opts, "portions": portions, "plans": plans,
        "orderComparison": _compare_common(portions, inp, settings, plans), "warnings": warnings, "promise": PROMISE,
    }


def _evaluate_portion(c: dict, portion: dict, inp: dict, t_opts: list[dict]) -> dict:
    checks, needs, requirements, excluded, candidates = [], [], [], [], []
    profiles, target_days = {}, {}
    transports = [t for t in t_opts if t["mode"] != "reefer" or c["foodClass"] != "dry"]
    for t in transports:
        profiles[t["id"]] = transit_segments(inp["journey"], t) + [storage_segment(inp["journey"], portion["storage"], max(portion["storageDays"], 0.01))]
        target_days[t["id"]] = sum(s["days"] for s in profiles[t["id"]])
    props = inp.get("properties") or {}
    ident = inp["identification"]
    st = portion["storage"]

    # 1. Check inputs
    checks.append({"key": "identity", "label": "Food identity", "status": "reported" if ident["confirmed"] else "unknown", "display": f'{c["name"]} ({inp["state"]})',
                   "message": "Suggested from photo and confirmed by user. A photo cannot establish moisture, pH, fat or microbial state." if ident["method"] == "photo-ai" else "Selected by user.",
                   "severity": "ok" if ident["confirmed"] else "block"})
    storage_status = "measured" if st.get("status") == "measured" else "reported" if st.get("tC") is not None else "assumed"
    display = st["type"] + (f', {num(st["tC"])} °C' if st.get("tC") is not None else "") + (f', {num(st["rhPct"])}% RH' if st.get("rhPct") is not None else "")
    checks.append({"key": "storage", "label": "Storage conditions", "status": storage_status, "display": display,
                   "message": "Room temperature/humidity assumed from destination climate. A ₹300 thermo-hygrometer reading would replace this assumption." if storage_status == "assumed" else "Provided by user.",
                   "severity": "info" if storage_status == "assumed" else "ok"})
    for i, n in enumerate(c.get("notes", [])):
        checks.append({"key": f"note-{i}", "label": "Note", "status": "reference", "display": "", "message": n, "severity": "info"})
    insufficient = None
    moist = c.get("moisture")
    mi = props.get("initialMoistureWb") or (moist["initialWb"] if moist else None)
    if moist:
        ok_status = mi["status"] in ("measured", "reported")
        checks.append({"key": "moisture", "label": "Initial moisture", "status": mi["status"], "display": fmt_ev(mi), "sourceId": mi.get("sourceId"),
                       "message": "Batch value provided." if ok_status else "Reference estimate, not a batch measurement. Measuring the batch (oven-drying or a moisture meter) narrows the uncertainty.",
                       "severity": "ok" if ok_status else "warn"})
        if mi["value"] >= moist["criticalWb"]["value"]:
            checks.append({"key": "moisture-limit", "label": "Moisture already at limit", "status": mi["status"], "display": fmt_ev(mi),
                           "message": f'The food is already at or above the {num(moist["criticalWb"]["value"])}% limit. Packaging cannot correct this — dry the product first.', "severity": "block"})
            insufficient = {"reason": "Initial moisture is at or above the critical limit; no packaging can make this batch compliant.",
                            "measurements": [{"label": "Re-dry and re-measure moisture", "why": "The product must be below its limit before packing.", "howToMeasure": "Oven-drying method or calibrated moisture meter."}]}
        checks.append({"key": "isotherm", "label": "Sorption isotherm", "status": moist["isoB"]["status"],
                       "display": f'M = {num(moist["isoA"]["value"])} + {num(moist["isoB"]["value"])}·aw (aw {num(moist["isoRange"][0])}–{num(moist["isoRange"][1])})',
                       "sourceId": moist["isoB"].get("sourceId"), "message": "Linearised isotherm — illustrative until replaced by a sourced or measured isotherm.",
                       "severity": "warn" if moist["isoB"].get("sourceId") == "SEED" else "info"})
        needs.append({"kind": "moisture", "level": "high", "text": f'Keep moisture below {num(moist["criticalWb"]["value"])}% (w.b.). {moist["criticalReason"]}'})
    if c.get("oxygen"):
        tol = c["oxygen"]["tolerancePpm"]
        checks.append({"key": "oxygen", "label": "Oxygen tolerance", "status": tol["status"], "display": fmt_ev(tol), "sourceId": tol.get("sourceId"),
                       "message": "Class-level tolerance (textbook table). A product-specific limit needs a storage study (peroxide value / sensory).", "severity": "info"})
        needs.append({"kind": "oxygen", "level": "high" if portion["storageDays"] > 30 else "medium", "text": c["oxygen"]["reason"]})
    if c.get("lightSensitive"):
        needs.append({"kind": "light", "level": "medium", "text": "Light accelerates colour loss / oxidation — opaque pack or dark outer carton."})
    if c.get("insectRisk"):
        needs.append({"kind": "insects", "level": "medium", "text": "Hermetic closure prevents insect entry; avoid tie-closures for storage."})
    if c["mechanical"]["fragility"] != "low":
        needs.append({"kind": "mechanical", "level": "high" if c["mechanical"]["fragility"] == "high" else "medium",
                      "text": "Crushable — limit stacking load and cushion." if c["mechanical"]["crushable"] else "Handle to avoid breakage."})
    if c.get("respiration"):
        r = c["respiration"]
        rc = props.get("rco2At20") or r["rco2At20"]
        checks.append({"key": "respiration", "label": "Respiration rate at 20 °C", "status": rc["status"], "display": fmt_ev(rc), "sourceId": rc.get("sourceId"),
                       "message": "Measured." if rc["status"] == "measured" else "Reference range — actual rate depends on cultivar and maturity. A closed-jar respiration test narrows the perforation range.",
                       "severity": "ok" if rc["status"] == "measured" else "warn"})
        needs.append({"kind": "respiration", "level": "high", "text": f'Keep O₂ {pct(r["targetO2"][0])}–{pct(r["targetO2"][1])} and CO₂ {pct(r["targetCo2"][0])}–{pct(r["targetCo2"][1])} ({r["sourceIdGas"]}); avoid O₂ < {pct(r["minO2"])} (fermentation) and CO₂ > {pct(r["maxCo2"])} (injury).'})
        chill = f'; chilling injury below {num(r["chillingInjuryBelowC"])} °C' if r.get("chillingInjuryBelowC") is not None else ""
        needs.append({"kind": "temperature", "level": "high", "text": f'Best at {num(r["storageTempC"][0])}–{num(r["storageTempC"][1])} °C{chill}.'})
        if rc is not r["rco2At20"]:
            c = {**c, "respiration": {**r, "rco2At20": rc}}
    if c.get("requiredMeasurements"):
        meas = props.get("measurements") or {}
        missing = [m for m in c["requiredMeasurements"] if not meas.get(m["key"])]
        for m in c["requiredMeasurements"]:
            v = meas.get(m["key"])
            checks.append({"key": m["key"], "label": m["label"], "status": v["status"] if v else "unknown", "display": fmt_ev(v) if v else "not provided",
                           "message": "Provided." if v else m["why"], "severity": "ok" if v else "block"})
        if missing:
            verb = "are" if len(missing) > 1 else "is"
            insufficient = {"reason": f'Evidence is insufficient to recommend packaging for {c["name"]}: {", ".join(m["label"].lower() for m in missing)} {verb} decision-critical and cannot be estimated from a photo or a reference table.',
                            "measurements": [{"label": m["label"], "why": m["why"], "howToMeasure": m["howToMeasure"]} for m in missing]}
        needs.append({"kind": "hygiene", "level": "high", "text": "Food-contact materials suitable for fatty/acidic/moist food; clean filling to avoid contamination."})
    if c["foodClass"] == "chilled-perishable":
        needs.append({"kind": "temperature", "level": "high", "text": "Continuous cold chain ≤ 4 °C (refrigerated transport and storage)."})
    base = {"portion": portion, "targetDays": target_days, "checks": checks, "needs": needs, "requirements": requirements, "excluded": excluded, "profiles": profiles}
    if insufficient:
        return {**base, "gaugeHints": [], "candidates": [], "insufficient": insufficient}

    # 2. Required WVTR (Monte Carlo over input uncertainty), cached per size & transport
    req_cache: dict = {}

    def wvtr_req(size, t_id: str, area: float) -> dict:
        key = (num(size), t_id)
        if key in req_cache:
            return req_cache[key]
        g = rng(99)
        vals = []
        for _ in range(40):
            r_ = required_wvtr({"initialWb": triangular(g, lo(mi), mi["value"], hi(mi)), "criticalWb": triangular(g, lo(moist["criticalWb"]), moist["criticalWb"]["value"], hi(moist["criticalWb"])),
                                "isoA": triangular(g, lo(moist["isoA"]), moist["isoA"]["value"], hi(moist["isoA"])), "isoB": triangular(g, lo(moist["isoB"]), moist["isoB"]["value"], hi(moist["isoB"])),
                                "isoRange": moist["isoRange"], "fillKg": size, "areaM2": area, "direction": moist["direction"]}, profiles[t_id])
            vals.append(1e6 if r_["alwaysOk"] else r_["wvtrTest"])
        s_ = summarize(vals)
        req_cache[key] = {"p50": s_["p50"], "strict": s_["p10"]}
        return req_cache[key]

    # 3. Candidates
    svc = _services(inp.get("userState"))
    svc_methods = list(dict.fromkeys(m for s in svc for m in s["packingService"]["methods"]))
    for s in ref.structures():
        if c["foodClass"] not in s["suitableFor"]:
            excluded.append({"structure": s["name"], "reason": f'Not a format for {c["foodClass"]} foods.'})
            continue
        if portion["use"] == "retail" and s["kind"] == "bulk-liner" and c["foodClass"] != "fresh":
            excluded.append({"structure": s["name"], "reason": "Bulk format — not used for retail packs."})
            continue
        if portion["use"] == "bulk" and s["kind"] == "primary" and not any(x >= 5 for x in s["sizesKg"]):
            excluded.append({"structure": s["name"], "reason": "Not available in bulk sizes."})
            continue
        if c["foodClass"] == "fresh" and s["kind"] != "rigid" and not s["microperforatable"]:
            excluded.append({"structure": s["name"], "reason": "Fresh produce needs gas exchange — film must be micro-perforatable."})
            continue
        if _fragile(c) and s["format"] == "vacuum-pack":
            excluded.append({"structure": s["name"], "reason": "Vacuum packing would crush this fragile food."})
            continue
        sizes = _candidate_sizes(s, portion, c)
        if not sizes:
            excluded.append({"structure": s["name"], "reason": f'Not available in {num(portion["packSizeKg"])} kg size.' if portion.get("packSizeKg") else "No suitable size for this portion."})
            continue
        for t in transports:
            if c["foodClass"] == "chilled-perishable" and t["mode"] != "reefer":
                continue
            for size in sizes:
                for control in _oxygen_controls(c, s, target_days[t["id"]]):
                    candidates.append(_evaluate_candidate(c, s, portion, inp, t, profiles[t["id"]], target_days[t["id"]], size, control, svc_methods, [x["id"] for x in svc], wvtr_req, mi))

    ref_t = next((t for t in transports if t["id"] == "dedicated"), transports[0] if transports else None)
    ref_size = portion.get("packSizeKg") or (0.5 if portion["use"] == "retail" else min(portion["kg"], 25))
    ref_geom = pack_geometry(ref.structures()[0], ref_size, c["bulkDensityKgPerL"], 1.05, False)
    gauge_hints = []
    mats = ref.materials()
    if moist and ref_t:
        r_ = wvtr_req(ref_size, ref_t["id"], ref_geom["permeableAreaM2"])
        requirements.append({"label": f'Required WVTR ({num(ref_size)} kg pack, {round(target_days[ref_t["id"]])} days)',
                             "value": "no moisture barrier needed" if r_["p50"] >= 1e5 else f'≤ {sig(r_["p50"])} g/m²·day (conservative {sig(r_["strict"])})',
                             "basis": "38 °C / 90% RH test condition; derived from the Labuza moisture-gain model over the full exposure profile (P50 and P10 of input uncertainty)."})
        if r_["strict"] < 1e5:
            for mid in ("LDPE", "HDPE", "BOPP", "CPP"):
                g_ = minimum_gauge(mid, None, r_["strict"])
                if g_:
                    gauge_hints.append({"material": mats[mid]["commonName"], "gaugeUm": g_["gaugeUm"], "exactUm": g_["exactUm"]})
    if c.get("oxygen") and ref_t:
        tol = c["oxygen"]["tolerancePpm"]
        otr = required_otr(tol["value"], ref_size, ref_geom["permeableAreaM2"], profiles[ref_t["id"]])
        otr_strict = required_otr(lo(tol), ref_size, ref_geom["permeableAreaM2"], profiles[ref_t["id"]])
        short = target_days[ref_t["id"]] <= OXIDATION_THRESHOLD_DAYS
        requirements.append({"label": f'Required OTR ({num(ref_size)} kg pack, {round(target_days[ref_t["id"]])} days)',
                             "value": f"not decision-critical for ≤ {OXIDATION_THRESHOLD_DAYS} days (would be ≤ {sig(otr)} for full budget)" if short else f"≤ {sig(otr)} cc/m²·day·atm (conservative {sig(otr_strict)})",
                             "basis": "23 °C / 0% RH test condition; oxygen-budget method (tolerable O₂ gain ÷ exposure-weighted ingress per unit OTR)."})
        if not short:
            for mid in ("BOPA", "EVOH", "PET"):
                g_ = minimum_gauge(mid, otr_strict)
                if g_:
                    gauge_hints.append({"material": f'{mats[mid]["commonName"]} (for OTR)', "gaugeUm": g_["gaugeUm"], "exactUm": g_["exactUm"]})
    if c.get("respiration"):
        r = c["respiration"]
        requirements.append({"label": "Target in-pack atmosphere", "value": f'O₂ {pct(r["targetO2"][0])}–{pct(r["targetO2"][1])}, CO₂ {pct(r["targetCo2"][0])}–{pct(r["targetCo2"][1])}',
                             "basis": f'{r["sourceIdGas"]} recommended atmosphere; film + perforation conductance sized to respiration at storage temperature.'})
    return {**base, "gaugeHints": gauge_hints, "candidates": candidates, "insufficient": None}


def _evaluate_candidate(c, s, portion, inp, t, profile, target, size, control, svc_methods, svc_ids, wvtr_req, mi) -> dict:
    units = math.ceil(portion["kg"] / size - 1e-9)
    vacuum = control == "vacuum"
    geom = pack_geometry(s, size, c["bulkDensityKgPerL"], 1.05, vacuum)
    reasons, conditions, still, evidence = [], [], [], []
    support = ["supported"]

    def downgrade(to: str):
        if to == "not-supported" or (to == "conditional" and support[0] == "supported"):
            support[0] = to

    products = sorted(_products_for(s["id"], size, inp.get("userState")), key=lambda p: p["unitPriceInr"][num(size)])
    product = products[0] if products else None
    generic = structure_at_test(s)
    scale_o2 = scale_h2o = 1.0
    provided_basis = "generic literature values"
    if product and product["documentation"] != "none" and product["declared"].get("otr") and product["declared"].get("wvtr") and not s.get("rigid"):
        scale_o2 = product["declared"]["otr"] / generic["otr"]
        scale_h2o = product["declared"]["wvtr"] / generic["wvtr"]
        provided_basis = f'supplier third-party test report ({product["declared"].get("reportDate")})' if product["documentation"] == "third-party-test-report" else "supplier-declared datasheet"
    documented = bool(product and product["documentation"] != "none")
    if not product:
        reasons.append("No matched supplier delivers this structure and size to your location.")
        downgrade("not-supported")
    elif product["documentation"] == "none" and s["id"] != "open-crate":
        still.append("Supplier has no barrier documentation — request an OTR/WVTR test report before relying on this option.")
        downgrade("conditional")

    cache: dict = {}

    def tx(t_c: float, rh: float) -> dict:
        key = (t_c, rh)
        if key not in cache:
            v = pack_transmission(s, geom["permeableAreaM2"], size, t_c, rh)
            cache[key] = {"o2": v["o2"] * scale_o2, "h2o": v["h2o"] * scale_h2o, "co2": v["co2"] * scale_o2}
        return cache[key]

    needs_hermetic = c["foodClass"] in ("dry", "wet-processed", "chilled-perishable") or (c["foodClass"] == "fresh" and s["kind"] == "primary")
    compat = seal_compatibility(s, inp["equipment"], {"hermetic": needs_hermetic, "vacuum": vacuum, "gasFlush": control == "gas-flush"}, svc_methods)
    via_service = None
    if not compat["compatible"]:
        reasons.extend(compat["reasons"])
        downgrade("not-supported")
    elif compat["viaService"]:
        via_service = next((x["id"] for x in ref.suppliers() if x["id"] in svc_ids and compat["method"] in x["packingService"]["methods"]), None)
        conditions.append(compat["reasons"][0])

    # --- Moisture (vectorised Monte Carlo)
    moisture = None
    margin_m = math.inf
    moist = c.get("moisture")
    if moist:
        g = rng(7 + round(size * 100))
        doc_var = 0.1 if product and product["documentation"] == "third-party-test-report" else 0.15 if product and product["documentation"] == "supplier-declared" else 0.25
        n = 120
        u = g.uniforms(5 * n).reshape(n, 5)  # same draw order as the web engine
        fvar = triangular_inv(u[:, 0], 1 - doc_var, 1, 1 + doc_var)
        mi_s = triangular_inv(u[:, 1], lo(mi), mi["value"], hi(mi))
        mc_s = triangular_inv(u[:, 2], lo(moist["criticalWb"]), moist["criticalWb"]["value"], hi(moist["criticalWb"]))
        a_s = triangular_inv(u[:, 3], lo(moist["isoA"]), moist["isoA"]["value"], hi(moist["isoA"]))
        b_s = triangular_inv(u[:, 4], lo(moist["isoB"]), moist["isoB"]["value"], hi(moist["isoB"]))
        h2o = [tx(seg["tC"], seg["rhPct"])["h2o"] for seg in profile]
        days = _moisture_days_mc(mi_s, mc_s, a_s, b_s, fvar, geom["permeableAreaM2"], size, profile, h2o, moist["direction"] == "gain")
        sm = summarize(np.where(np.isfinite(days), days, 1e6))
        extrapolated = any(seg["rhPct"] / 100 > moist["isoRange"][1] + 0.05 or seg["rhPct"] / 100 < moist["isoRange"][0] - 0.05 for seg in profile)
        central = moisture_trajectory({"initialWb": mi["value"], "criticalWb": moist["criticalWb"]["value"], "direction": moist["direction"], "isoA": moist["isoA"]["value"],
                                       "isoB": moist["isoB"]["value"], "isoRange": moist["isoRange"], "fillKg": size, "areaM2": geom["permeableAreaM2"]},
                                      profile, lambda t_c, rh: tx(t_c, rh)["h2o"], 6)
        req = wvtr_req(size, t["id"], geom["permeableAreaM2"])
        provided = math.nan if s.get("rigid") else generic["wvtr"] * scale_h2o
        moisture = {"requiredWvtrP50": req["p50"], "requiredWvtrStrict": req["strict"], "providedWvtr": provided, "providedBasis": provided_basis,
                    "daysP10": sm["p10"], "daysP50": sm["p50"], "targetDays": target, "extrapolated": extrapolated, "trace": central["trace"], "criticalWb": moist["criticalWb"]["value"]}
        margin_m = sm["p10"] / target
        if sm["p50"] < target:
            reasons.append(f'Moisture reaches {num(moist["criticalWb"]["value"])}% after ≈{round(sm["p50"])} days (median) — target is {round(target)} days.')
            downgrade("not-supported")
        elif sm["p10"] < target:
            still.append(f'Moisture protection is marginal: conservative estimate {round(sm["p10"])} days vs target {round(target)} days. Measuring the batch moisture would firm this up.')
            downgrade("conditional")
        if extrapolated:
            still.append("Humidity along the journey lies outside the isotherm's applicable range — estimate is an extrapolation.")
        evidence.append({"label": "Moisture protection (P10 / P50 days to limit)", "value": f'{fmt_days(sm["p10"])} / {fmt_days(sm["p50"])} vs target {round(target)} d', "status": "calculated", "sourceId": "LABUZA"})
        if not s.get("rigid"):
            evidence.append({"label": "Pack WVTR (38 °C / 90% RH)", "value": f'{sig(provided)} g/m²·day — required ≤ {"any" if req["p50"] >= 1e5 else sig(req["p50"])}',
                             "status": "documented" if documented else "generic", "sourceId": "SIM" if documented else "POLYMER-HANDBOOK", "note": provided_basis})

    # --- Oxygen
    oxygen = None
    margin_o = math.inf
    if c.get("oxygen"):
        tol = c["oxygen"]["tolerancePpm"]
        budget, budget_strict = tol["value"] * size, lo(tol) * size
        ingress = oxygen_ingress_mg(profile, lambda t_c, rh: tx(t_c, rh)["o2"])
        hs = headspace_o2_mg(geom["headspaceL"], RESIDUAL_O2[control])
        absorber_cc = None
        eff_ingress, eff_hs = ingress, hs
        note = ""
        if control == "absorber":
            a_ = size_absorber(geom["headspaceL"], ingress)
            absorber_cc = a_["sachetCc"]
            if not absorber_cc:
                reasons.append("Oxygen ingress too large for a practical absorber sachet.")
                downgrade("not-supported")
            else:
                eff_ingress = eff_hs = 0.0
                note = f'One {absorber_cc} cc absorber sachet absorbs headspace O₂ and ingress (need ≈{round(a_["neededCc"])} cc incl. 30% margin).'
        req_otr = required_otr(tol["value"], size, geom["permeableAreaM2"], profile)
        provided_otr = math.nan if s.get("rigid") else generic["otr"] * scale_o2
        oxygen = {"requiredOtr": req_otr, "providedOtr": provided_otr, "ingressMg": ingress, "headspaceMg": hs, "budgetMg": budget, "budgetStrictMg": budget_strict, "absorberCc": absorber_cc, "note": note}
        long_term = target > OXIDATION_THRESHOLD_DAYS
        available = eff_ingress + eff_hs
        if long_term:
            margin_o = budget_strict / available if available > 0 else math.inf
            if eff_hs > budget:
                reasons.append(f"Air left in the pack holds ≈{sig(hs)} mg O₂ — more than the {sig(budget)} mg tolerance for storage beyond {OXIDATION_THRESHOLD_DAYS} days. Use gas flushing, vacuum or an absorber.")
                downgrade("not-supported")
            elif eff_ingress > budget - eff_hs:
                reasons.append(f"Oxygen entering over {round(target)} days (≈{sig(ingress)} mg) plus residual headspace exceeds the tolerable {sig(budget)} mg for a {num(size)} kg pack.")
                downgrade("not-supported")
            elif available > budget_strict:
                still.append("Oxygen exposure is within the typical tolerance but above the strict end of the range.")
                downgrade("conditional")
        elif available > budget:
            conditions.append(f"About {sig(available)} mg O₂ is available to the food (headspace + ingress) vs a long-storage tolerance of {sig(budget)} mg. For {round(target)} days this is treated as acceptable because oxidation is slow over short periods — an assumption (≤ {OXIDATION_THRESHOLD_DAYS} days) to confirm by sensory check.")
        evidence.append({"label": "Oxygen available (ingress + headspace) vs tolerance", "value": f'{sig(eff_ingress)} + {sig(eff_hs)} mg vs {sig(budget)} mg{"" if long_term else " (not decision-critical ≤ 30 d)"}', "status": "calculated", "sourceId": "SALAME"})
        if not s.get("rigid"):
            evidence.append({"label": "Pack OTR (23 °C / 0% RH)", "value": f"{sig(provided_otr)} cc/m²·day·atm — required ≤ {sig(req_otr)}",
                             "status": "documented" if documented else "generic", "sourceId": "SIM" if documented else "POLYMER-HANDBOOK", "note": provided_basis})
        if control == "gas-flush":
            conditions.append("Nitrogen flush to ≤ 2% residual O₂ — verify with a headspace oxygen analyser on sample packs.")
            evidence.append({"label": "Residual O₂ after flushing", "value": "≤ 2% (assumed)", "status": "assumed", "note": "Measure with a headspace analyser"})
        if control == "vacuum":
            conditions.append("Vacuum pack — check for leaks (loss of vacuum within 24 h means seal failure).")

    if c.get("lightSensitive") and s["transparency"] != "opaque":
        conditions.append("Clear pack: keep in a closed outer carton and store away from light.")

    # --- Fresh produce: MAP + temperature
    map_design = None
    fresh = None
    margin_f = math.inf
    if c.get("respiration"):
        fl = _fresh_life(c, profile)
        r = c["respiration"]
        fresh = {"consumedFraction": fl["consumed"], "consumedRange": [fl["consumedOptimistic"], fl["consumedConservative"]], "optimumDays": r["maxStorageDaysAtOptimum"],
                 "chillingRisk": fl["chilling"], "note": f'Relative-rate estimate: at {num(fl["tOpt"])} °C the reference life is ≈{num(fl["dOpt"])} days; warmer segments consume it faster in proportion to respiration (Q10 {num(r["q10"]["value"])}).'}
        margin_f = 1 / max(fl["consumedConservative"], 1e-6)
        if fl["consumedOptimistic"] > 1:
            reasons.append(f'The journey and storage temperatures use up ≈{round(fl["consumed"] * 100)}% of the produce\'s reference storage life (even the optimistic estimate exceeds 100%) — no packaging can compensate; shorten storage or cool the produce.')
            downgrade("not-supported")
        elif fl["consumedConservative"] > 0.8:
            still.append(f'Uses ≈{round(fl["consumed"] * 100)}% of the reference storage life (range {round(fl["consumedOptimistic"] * 100)}–{round(fl["consumedConservative"] * 100)}%) — little margin for delays.')
            downgrade("conditional")
        if fl["chilling"]:
            reasons.append(f'Temperatures below {num(r["chillingInjuryBelowC"])} °C risk chilling injury.')
            downgrade("not-supported")
        evidence.append({"label": "Storage-life consumed (relative rate)", "value": f'{round(fl["consumed"] * 100)}%', "status": "calculated", "sourceId": "USDA-HB66",
                         "note": "Respiration-rate proportional estimate — not a shelf-life claim."})
        if s["microperforatable"]:
            storage_t = profile[-1]["tC"]
            film_um = sum(l["thicknessUm"] for l in s["layers"])
            beta = ref.materials()[s["layers"][0]["materialId"]]["co2O2Ratio"] if s["layers"] else 4
            map_design = design_map(c, size, film_um, lambda t_c: tx(t_c, 90)["o2"], beta, geom["headspaceL"], profile, storage_t)
            if not map_design["feasible"]:
                reasons.append(map_design["reason"])
                downgrade("not-supported")
            else:
                conditions.append(f'Laser micro-perforation: {map_design["holes"]} holes of {map_design["holeDiameterUm"]} µm per pack (range {map_design["holesRange"][0]}–{map_design["holesRange"][1]} for the respiration range).')
                still.append("Verify the atmosphere in sample packs with a headspace O₂/CO₂ analyser after equilibrium.")
                if map_design["probability"]["inWindow"] < 0.8:
                    downgrade("conditional")
            pr = map_design["probability"]
            evidence.append({"label": "MAP equilibrium at storage (P10–P90 O₂)", "value": f'{pct(map_design["o2Dist"]["p10"])}–{pct(map_design["o2Dist"]["p90"])}; in window {round(pr["inWindow"] * 100)}%, anaerobic risk {round(pr["anaerobic"] * 100)}%',
                             "status": "calculated", "sourceId": "FISHMAN"})
        else:
            conditions.append("Open ventilated crate — no modified atmosphere; relies on temperature and short transit.")
        if r["ethyleneProducer"]:
            conditions.append("Do not ship with ethylene-sensitive produce.")

    # --- Wet / chilled foods with measurements provided
    if c.get("requiredMeasurements"):
        meas = (inp.get("properties") or {}).get("measurements") or {}
        if c["id"] == "mango-pickle":
            ph = (meas.get("ph") or {}).get("value", 7)
            if ph > 4.6:
                reasons.append("pH above 4.6: ambient storage safety depends on a validated process — outside this tool's scope; consult a food technologist.")
                downgrade("not-supported")
            else:
                conditions.append("Acidified product (pH ≤ 4.6 measured). Keep an oil layer on top; use clean, dry filling.")
                still.append("Shelf life must come from a storage study of this recipe — not predicted here.")
                downgrade("conditional")
            if s["id"] in ("pet-al-pe", "pet-pe"):
                still.append("Confirm the sealant is declared suitable for oily/acidic foods (migration compliance).")
        if c["foodClass"] == "chilled-perishable":
            study = (meas.get("micro") or {}).get("value")
            if study is not None and portion["storageDays"] + t["transitHours"] / 24 > study:
                reasons.append(f"Measured shelf life ({num(study)} days at ≤ 4 °C) is shorter than the requested {round(target)} days.")
                downgrade("not-supported")
            conditions.append("Cold chain ≤ 4 °C throughout — refrigerated vehicle and storage.")
            evidence.append({"label": "Shelf life at ≤ 4 °C (user storage study)", "value": f"{num(study)} days" if study is not None else "not provided",
                             "status": (meas.get("micro") or {}).get("status", "unknown")})

    # --- Seal specification & mechanical
    seal = seal_specification(s, c, size, compat["method"], units, vacuum or control == "gas-flush" or bool(map_design), vacuum) if compat["method"] else None
    if not s.get("rigid") and seal and seal["punctureNote"] and seal["punctureNote"].startswith("Low"):
        still.append(seal["punctureNote"])
        downgrade("conditional")
    cartons = crate = None
    outer_inr, outer_detail = 0.0, ""
    storage_rh = profile[-1]["rhPct"]
    if c["foodClass"] == "fresh":
        cr = CRATES[0]
        n_cr = math.ceil(portion["kg"] / cr["capacityKg"]) if s["kind"] in ("rigid", "bulk-liner") else math.ceil(portion["kg"] / (cr["capacityKg"] * 0.8))
        crate = {"crates": n_cr, "name": cr["name"]}
        outer_inr = n_cr * cr["priceInr"]
        outer_detail = f'{n_cr} × {cr["name"]} (per-trip rental, simulated)'
    elif not (s["kind"] == "bulk-liner" and s["id"] == "woven-ldpe-liner"):
        w, l_ = geom["flatWidthCm"] * 0.85, geom["flatLengthCm"] * 0.85
        cartons = plan_cartons(size, {"w": w, "l": l_, "t": max(3, geom["packVolumeL"] * 1000 / (w * l_))}, units, 1.5, portion["storageDays"] + t["transitHours"] / 24, storage_rh)
        outer_inr = cartons["cartons"] * cartons["costPerCartonInr"]
        outer_detail = f'{cartons["cartons"]} × {(cartons["grade"] or {}).get("name", "carton")}'
        if not cartons["grade"]:
            still.append(cartons["note"])
            downgrade("conditional")

    # --- Sustainability
    mats = ref.materials()
    film_g = film_mass_g(s, geom, lambda mid: mats[mid]["densityGcc"])
    rec = recyclability(s)
    if s.get("rigid"):
        f = {"metal": [2.5, 3.5], "glass": [0.8, 1.2], "PET": [2.2, 3.0], "PP": [1.6, 2.0]}.get(s["rigid"]["family"], [2, 3])
        co2e = [film_g / 1000 * f[0] / size, film_g / 1000 * f[1] / size]
    else:
        tot = sum(l["thicknessUm"] * mats[l["materialId"]]["densityGcc"] for l in s["layers"])
        co2e = [0.0, 0.0]
        for l in s["layers"]:
            m = mats[l["materialId"]]
            share = l["thicknessUm"] * m["densityGcc"] / tot
            co2e[0] += film_g / 1000 * share * m["co2eKgPerKg"][0] / size
            co2e[1] += film_g / 1000 * share * m["co2eKgPerKg"][1] / size
    sust_score = rec["score"] - min(0.4, (co2e[0] + co2e[1]) / 2 * 4)

    # --- Consumables & cost item
    consumables, cd = 0.0, []
    if control == "gas-flush":
        consumables += 0.6 * units
        cd.append("N₂ gas ≈ ₹0.6/pack")
    if control == "absorber" and oxygen and oxygen["absorberCc"]:
        consumables += ref.absorber_price(oxygen["absorberCc"]) * units
        cd.append(f'{oxygen["absorberCc"]} cc absorber sachets')
    if map_design and map_design["feasible"] and map_design["holes"] > 0:
        consumables += 0.4 * units
        cd.append("laser micro-perforation ≈ ₹0.4/pack")
    cost = {"portionId": portion["id"], "supplierProductId": product["id"] if product else None, "sizeKey": num(size), "units": units,
            "consumablesInr": consumables, "consumablesDetail": ", ".join(cd), "labourMinutes": _labour_minutes(s, control, units, size),
            "serviceId": via_service, "outerInr": outer_inr, "outerDetail": outer_detail, "kg": portion["kg"]}
    margin = min(margin_m, margin_o, margin_f)
    cand = {
        "key": f'{portion["id"]}|{t["id"]}|{s["id"]}|{num(size)}|{control}', "portionId": portion["id"], "transportId": t["id"],
        "structureId": s["id"], "structureName": s["name"], "plainName": ref.plain_name(s["id"]), "layersText": s["name"] if s.get("rigid") else describe_layers(s),
        "format": s["format"], "packSizeKg": size, "units": units, "oxygenControl": control, "sealMethod": compat["method"], "viaService": via_service,
        "supplierProductId": product["id"] if product else None, "supplierName": ref.get_supplier(product["supplierId"])["name"] if product else None,
        "documentation": product["documentation"] if product else None, "geometry": geom, "support": support[0], "reasons": reasons, "conditions": conditions,
        "stillToCheck": still, "moisture": moisture, "oxygen": oxygen, "map": map_design, "fresh": fresh, "seal": seal, "sealNote": " ".join(compat["reasons"]),
        "cartons": cartons, "crate": crate, "margin": margin if math.isfinite(margin) else 99, "delayMargin": None,
        "sustainability": {"filmGPerPack": film_g, "filmGPerKgFood": film_g / size, "recyclability": rec, "co2eKgPerKgFood": co2e, "score": sust_score},
        "cost": cost, "standaloneInr": standalone_cost(cost), "evidence": evidence, "explanation": "",
    }
    if support[0] != "not-supported":
        cand["delayMargin"] = _delay_margin(c, portion, inp, t, size, control, geom, tx, mi)
    cand["explanation"] = _explain(c, cand, t, profile)
    if seal:
        evidence.append({"label": "Seal", "value": f'{EQUIPMENT[seal["method"]]["label"]}{", sealant " + num(seal["sealTempC"][0]) + "–" + num(seal["sealTempC"][1]) + " °C" if seal["sealTempC"] else ""}, width ≥ {seal["sealWidthMm"]} mm',
                         "status": "calculated", "note": "Proposed acceptance criteria — expert confirmation pending"})
    return cand


def _delay_margin(c, portion, inp, t, size, control, geom, tx, mi) -> float:
    profile = transit_segments(inp["journey"], t, DELAY_SCENARIO) + [storage_segment(inp["journey"], portion["storage"], max(portion["storageDays"], 0.01))]
    target = sum(x["days"] for x in profile)
    m = math.inf
    moist = c.get("moisture")
    if moist:
        r = moisture_trajectory({"initialWb": mi["value"], "criticalWb": moist["criticalWb"]["value"], "direction": moist["direction"], "isoA": moist["isoA"]["value"],
                                 "isoB": moist["isoB"]["value"], "isoRange": moist["isoRange"], "fillKg": size, "areaM2": geom["permeableAreaM2"]},
                                profile, lambda t_c, rh: tx(t_c, rh)["h2o"] * 1.15, 1)
        ext = r["criticalDayExtended"] if r["criticalDayExtended"] is not None else 1e6
        m = min(m, ext / target)
    if c.get("oxygen") and target > OXIDATION_THRESHOLD_DAYS:
        ingress = 0 if control == "absorber" else oxygen_ingress_mg(profile, lambda t_c, rh: tx(t_c, rh)["o2"])
        hs = 0 if control == "absorber" else headspace_o2_mg(geom["headspaceL"], RESIDUAL_O2[control])
        budget = lo(c["oxygen"]["tolerancePpm"]) * size
        m = min(m, budget / (ingress + hs) if ingress + hs > 0 else 99)
    if c.get("respiration"):
        m = min(m, 1 / _fresh_life(c, profile)["consumedConservative"])
    return min(m, 99) if math.isfinite(m) else 99


def _explain(c: dict, k: dict, t: dict, profile: list[dict]) -> str:
    store = profile[-1]
    parts = []
    fam = next(iter(ref.examples_for(k["structureId"])), None)
    like = ""
    if fam:
        like = f' It is the same kind of pack as {fam["products"].lower()}' + (f' such as {", ".join(fam["brands"])}' if fam["brands"] else "") + "."
    parts.append(f'{k["plainName"]} ({k["structureName"]}) in {num(k["packSizeKg"])} kg packs ({k["units"]} packs), sent by {t["label"].lower()}.{like}')
    m = k["moisture"]
    if m:
        lead = f'Your {c["name"].lower()} must stay below {num(m["criticalWb"])}% moisture. In {store["label"].lower()} at about {num(store["tC"])} °C and {store["rhPct"]}% RH ({store["status"]}),'
        if m["daysP10"] > 3650:
            parts.append(f'{lead} this pack keeps it below the limit for well over the whole period (cautious estimate more than 10 years); you need {round(m["targetDays"])} days.')
        else:
            parts.append(f'{lead} this pack keeps it below the limit for about {fmt_days(m["daysP50"])} (cautious estimate {fmt_days(m["daysP10"])}); you need {round(m["targetDays"])} days.')
    o = k["oxygen"]
    if o:
        if k["oxygenControl"] == "none":
            parts.append(f'Oxygen: about {sig(o["ingressMg"])} mg enters over the period against a tolerance of {sig(o["budgetMg"])} mg per pack.')
        else:
            how = {"gas-flush": "nitrogen flushing", "vacuum": "vacuum packing"}.get(k["oxygenControl"], "an oxygen absorber")
            parts.append(f'Oxygen is controlled by {how}; about {sig(o["ingressMg"])} mg enters through the film against a tolerance of {sig(o["budgetMg"])} mg.')
    if k["map"]:
        parts.append(("Gas exchange: " if k["map"]["feasible"] else "Gas exchange problem: ") + k["map"]["reason"])
    if k["fresh"]:
        parts.append(f'Temperature uses about {round(k["fresh"]["consumedFraction"] * 100)}% of the produce\'s reference storage life.')
    if k["conditions"]:
        parts.append("It applies only if: " + " ".join(k["conditions"]))
    if k["stillToCheck"]:
        parts.append("Still to check: " + " ".join(k["stillToCheck"]))
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Order-level plans

def _combos(lists: list[list[dict]], limit: int = 3000) -> list[list[dict]]:
    out = []
    for combo in itertools.product(*lists):
        out.append(list(combo))
        if len(out) >= limit:
            break
    return out


def _build_plans(portions: list[dict], t_opts: list[dict], inp: dict, settings: dict) -> list[dict]:
    active = [p for p in portions if not p["insufficient"]]
    if not active:
        return []
    all_cands = {c["key"]: c for p in active for c in p["candidates"]}

    def mk(t: dict, sel: list[dict]) -> dict:
        cost = aggregate_order_cost([x["cost"] for x in sel], t, inp["journey"]["origin"], settings)
        dms = [x["delayMargin"] for x in sel if x["delayMargin"] is not None]
        return {
            "id": f'{t["id"]}:' + ",".join(x["key"] for x in sel), "tags": ["lowest-cost"], "transport": t,
            "selections": [{"portionId": x["portionId"], "candidateKey": x["key"]} for x in sel], "cost": cost, "deliveryHours": t["transitHours"],
            "minMargin": min(x["margin"] for x in sel), "minDelayMargin": min(dms) if len(dms) == len(sel) else None,
            "sustainabilityScore": sum(x["sustainability"]["score"] * x["cost"]["kg"] for x in sel) / sum(x["cost"]["kg"] for x in sel),
            "overBudget": bool(inp.get("budgetInrPerKg")) and cost["perKgInr"] > inp["budgetInrPerKg"], "headline": "", "whatItCommunicates": "",
        }

    ok = lambda x: x["support"] != "not-supported" and x["supplierProductId"]  # noqa: E731
    evaluated = []
    for t in t_opts:
        lists = [[x for x in p["candidates"] if x["transportId"] == t["id"] and ok(x)] for p in active]
        if any(not l for l in lists):
            continue
        tops = []
        for i, l in enumerate(lists):
            srt = sorted(l, key=lambda x: x["standaloneInr"])
            pick = srt[:4]
            others = [o for j, ol in enumerate(lists) if j != i for o in sorted(ol, key=lambda x: x["standaloneInr"])[:4]]
            for o in others:
                same = next((x for x in l if x["supplierProductId"] == o["supplierProductId"] and x["packSizeKg"] == o["packSizeKg"] and x["oxygenControl"] == o["oxygenControl"]), None)
                if same and same not in pick:
                    pick.append(same)
            for x in [y for y in srt if y["support"] == "supported"][:2]:
                if x not in pick:
                    pick.append(x)
            robust = max(l, key=lambda x: x["delayMargin"] or 0)
            green = sorted(l, key=lambda x: (-x["sustainability"]["score"], x["standaloneInr"]))[0]
            for x in (robust, green):
                if x not in pick:
                    pick.append(x)
            tops.append(pick)
        evaluated.extend(mk(t, sel) for sel in _combos(tops))
    if not evaluated:
        return []
    fully = [p for p in evaluated if all(all_cands[s["candidateKey"]]["support"] == "supported" for s in p["selections"])]
    pool = fully or evaluated
    by_cost = lambda p: p["cost"]["totalInr"]  # noqa: E731
    plans = [{**min(pool, key=by_cost), "tags": ["lowest-cost"]}]
    fastest = min(p["deliveryHours"] for p in pool)
    plans.append({**min((p for p in pool if p["deliveryHours"] == fastest), key=by_cost), "tags": ["faster"]})
    rob = [p for p in pool if p["minDelayMargin"] is not None]
    if rob:
        plans.append({**sorted(rob, key=lambda p: (-min(p["minDelayMargin"], 5), p["cost"]["totalInr"]))[0], "tags": ["delay-tolerant"]})
    plans.append({**sorted(pool, key=lambda p: (-p["sustainabilityScore"], p["cost"]["totalInr"]))[0], "tags": ["sustainable"]})
    merged: list[dict] = []
    for p in plans:
        same = next((m for m in merged if m["id"] == p["id"]), None)
        if same:
            same["tags"] = same["tags"] + p["tags"]
        else:
            merged.append({**p, "tags": list(p["tags"])})
    base = next(m for m in merged if "lowest-cost" in m["tags"])
    for m in merged:
        extra = m["cost"]["totalInr"] - base["cost"]["totalInr"]
        m["headline"] = " · ".join(TAG_LABEL[t] for t in m["tags"])
        bits = []
        if "lowest-cost" in m["tags"]:
            bits.append(f'Lowest total among qualifying options and simulated quotations: ₹{inr_fmt(m["cost"]["totalInr"])} (₹{m["cost"]["perKgInr"]:.2f}/kg).')
        if "faster" in m["tags"]:
            bits.append(f'Delivers in ≈{round(m["deliveryHours"])} h' + (f", ₹{inr_fmt(extra)} more than the lowest-cost plan" if extra > 0 else "") + ".")
        if "delay-tolerant" in m["tags"]:
            bits.append(f'Still within limits if transit is delayed 48 h at +4 °C (lowest margin ×{min(m["minDelayMargin"] or 0, 99):.1f}). This is wider tolerance of stated conditions — not a claim of general superiority.')
        if "sustainable" in m["tags"]:
            bits.append("Best documented recyclability / lower indicative packaging footprint among feasible options" + (f" (₹{inr_fmt(extra)} more)" if extra > 0 else "") + ".")
        m["whatItCommunicates"] = " ".join(bits)
    return merged


def _compare_common(portions: list[dict], inp: dict, settings: dict, plans: list[dict]) -> list[dict]:
    out = []
    base = next((p for p in plans if "lowest-cost" in p["tags"]), None)
    if not base:
        return out
    retail = [p for p in portions if p["portion"]["use"] == "retail" and not p["insufficient"]]
    if len(retail) < 2:
        return out
    t = base["transport"]
    others = []
    for p in portions:
        if p in retail or p["insufficient"]:
            continue
        sel = next(x for x in base["selections"] if x["portionId"] == p["portion"]["id"])
        others.append(next(c for c in p["candidates"] if c["key"] == sel["candidateKey"]))

    def usable(x):
        return x["transportId"] == t["id"] and x["support"] != "not-supported" and x["supplierProductId"]

    separate = [min((x for x in p["candidates"] if usable(x)), key=lambda x: x["standaloneInr"], default=None) for p in retail]
    if all(separate):
        cost = aggregate_order_cost([x["cost"] for x in separate + others], t, inp["journey"]["origin"], settings)
        out.append({"label": "Different pack for each retail need (each cheapest on its own)", "totalInr": cost["totalInr"], "perKgInr": cost["perKgInr"],
                    "note": " | ".join(f'{x["structureName"]} {num(x["packSizeKg"])} kg' + (f' + {x["oxygenControl"]}' if x["oxygenControl"] != "none" else "") for x in separate)})
    keys: dict = {}
    for p in retail:
        for x in p["candidates"]:
            if not usable(x):
                continue
            k = (x["supplierProductId"], x["packSizeKg"], x["oxygenControl"])
            arr = keys.setdefault(k, [])
            if not any(y["portionId"] == x["portionId"] for y in arr):
                arr.append(x)
    best = None
    for arr in keys.values():
        if len(arr) != len(retail):
            continue
        cost = aggregate_order_cost([x["cost"] for x in arr + others], t, inp["journey"]["origin"], settings)
        if not best or cost["totalInr"] < best["totalInr"]:
            best = {"label": "One standard retail pack across the order", "totalInr": cost["totalInr"], "perKgInr": cost["perKgInr"],
                    "note": f'{arr[0]["structureName"]} {num(arr[0]["packSizeKg"])} kg' + (f' + {arr[0]["oxygenControl"]}' if arr[0]["oxygenControl"] != "none" else "") + " for all retail portions"}
    if best:
        out.append(best)
    return out
