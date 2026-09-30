"""Trial & Verify analysis on top of validation.py."""
from __future__ import annotations

from .. import reference as ref
from .validation import claim_text, decide, prediction_error, sample_size_means, sample_size_proportions, two_proportions, welch

CAVEAT = ("Results apply to the trial conditions only. A single trial does not establish a universal shelf-life claim; "
          "the decision uses the pre-registered minimum difference and the 95% confidence interval.")


def analyze_trial(design: dict, obs: list[dict]) -> dict:
    try:
        commodity = ref.get_commodity(design["commodityId"])["name"]
    except KeyError:
        commodity = design["commodityId"]
    metrics = []
    for m in design["metrics"]:
        rows = [o for o in obs if o["metric"] == m["key"]]
        days = {r["day"] for r in rows if any(x["day"] == r["day"] and x["arm"] == "control" for x in rows) and any(x["day"] == r["day"] and x["arm"] == "treatment" for x in rows)}
        day = max(days) if days else None
        base = {"metric": m, "day": day, "control": "–", "treatment": "–", "diff": None, "ci": None, "p": None, "decision": "insufficient-data", "claim": None}
        if day is None:
            metrics.append(base)
            continue
        c = [r for r in rows if r["day"] == day and r["arm"] == "control"]
        t = [r for r in rows if r["day"] == day and r["arm"] == "treatment"]
        ctx = {"commodity": commodity, "control": design["control"], "treatment": design["treatment"], "days": day, "conditions": design["conditions"], "n": ""}
        if m["type"] == "continuous":
            w = welch([x["value"] for x in c], [x["value"] for x in t])
            if not w:
                metrics.append({**base, "control": f"n={len(c)}", "treatment": f"n={len(t)}"})
                continue
            th = {"metric": m["label"], "direction": m["direction"], "minimumDifference": m["minimumDifference"], "unit": m["unit"]}
            decision = decide(w["ci"], th)
            ctx["n"] = f'n = {w["nC"]} control, {w["nT"]} treatment'
            metrics.append({**base, "control": f'{w["meanControl"]:.2f} {m["unit"]} (n={w["nC"]})', "treatment": f'{w["meanTreatment"]:.2f} {m["unit"]} (n={w["nT"]})',
                            "diff": w["diff"], "ci": w["ci"], "p": w["p"], "decision": decision, "claim": claim_text(decision, th, w["ci"], ctx)})
            continue
        xc, nc = sum(x["value"] for x in c), sum(x.get("n") or 0 for x in c)
        xt, nt = sum(x["value"] for x in t), sum(x.get("n") or 0 for x in t)
        if not nc or not nt:
            metrics.append(base)
            continue
        tp = two_proportions(xc, nc, xt, nt)
        ci = [tp["ci"][0] * 100, tp["ci"][1] * 100]
        th = {"metric": m["label"], "direction": m["direction"], "minimumDifference": m["minimumDifference"], "unit": "percentage points"}
        decision = decide(ci, th)
        ctx["n"] = f"{nc:g} control and {nt:g} treatment units"
        metrics.append({**base, "control": f'{tp["pC"] * 100:.1f}% ({xc:g}/{nc:g})', "treatment": f'{tp["pT"] * 100:.1f}% ({xt:g}/{nt:g})',
                        "diff": tp["diff"] * 100, "ci": ci, "p": tp["p"], "decision": decision, "claim": claim_text(decision, th, ci, ctx)})
    pairs = []
    for p in design.get("predictions") or []:
        vals = [o["value"] for o in obs if o["arm"] == "treatment" and o["metric"] == p["metric"] and o["day"] == p["day"]]
        if vals:
            pairs.append({"predicted": p["predicted"], "observed": sum(vals) / len(vals), "day": p["day"], "metric": p["metric"]})
    primary = next((m for m in metrics if m["metric"]["key"] == design["primaryMetric"]), None)
    return {"metrics": metrics, "primary": primary, "modelEvaluation": {"pairs": pairs, **prediction_error(pairs)} if pairs else None, "caveat": CAVEAT}


def suggest_sample_size(m: dict, sd: float | None = None, p_control: float | None = None) -> int:
    if m["type"] == "continuous":
        return sample_size_means(sd or 1, max(m["minimumDifference"], 1e-6))
    p1 = p_control if p_control is not None else 0.8
    p2 = min(0.999, max(0.001, p1 + (1 if m["direction"] == "treatment-higher" else -1) * m["minimumDifference"] / 100))
    return sample_size_proportions(p1, p2)
