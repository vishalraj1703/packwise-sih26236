"""Gap 5 — validation and benefit claims (SciPy statistics).

Trials are pre-registered (thresholds locked before data entry), analysed with Welch's
t-test and Newcombe/Wilson intervals, and claims are generated only from what the data
support, with their conditions attached.
"""
from __future__ import annotations

import json
import math

import numpy as np
from scipy import stats


def sample_size_means(sd: float, delta: float, alpha: float = 0.05, power: float = 0.8) -> int:
    z = stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)
    return math.ceil(2 * z * z * sd * sd / (delta * delta))


def sample_size_proportions(p1: float, p2: float, alpha: float = 0.05, power: float = 0.8) -> int:
    za, zb = stats.norm.ppf(1 - alpha / 2), stats.norm.ppf(power)
    pbar = (p1 + p2) / 2
    n = (za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p1 - p2) ** 2
    return math.ceil(n)


def welch(control: list[float], treatment: list[float], conf: float = 0.95) -> dict | None:
    if len(control) < 2 or len(treatment) < 2:
        return None
    c, t = np.asarray(control, float), np.asarray(treatment, float)
    vc, vt = c.var(ddof=1), t.var(ddof=1)
    se2 = vc / c.size + vt / t.size
    se = math.sqrt(se2)
    df = se2 ** 2 / ((vc / c.size) ** 2 / (c.size - 1) + (vt / t.size) ** 2 / (t.size - 1)) if se > 0 else c.size + t.size - 2
    diff = float(t.mean() - c.mean())
    tc = stats.t.ppf((1 + conf) / 2, df)
    p = float(stats.ttest_ind(t, c, equal_var=False).pvalue) if se > 0 else 1.0
    return {"meanControl": float(c.mean()), "meanTreatment": float(t.mean()), "diff": diff, "ci": [diff - tc * se, diff + tc * se],
            "df": float(df), "t": diff / se if se > 0 else 0.0, "p": p, "nC": int(c.size), "nT": int(t.size)}


def two_proportions(x_c: int, n_c: int, x_t: int, n_t: int, conf: float = 0.95) -> dict:
    """Difference of proportions with the Newcombe hybrid-score (Wilson) interval."""
    z = stats.norm.ppf((1 + conf) / 2)

    def wilson(x, n):
        p = x / n
        den = 1 + z * z / n
        centre = (p + z * z / (2 * n)) / den
        half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
        return centre - half, centre + half

    p_c, p_t = x_c / n_c, x_t / n_t
    l_c, u_c = wilson(x_c, n_c)
    l_t, u_t = wilson(x_t, n_t)
    diff = p_t - p_c
    ci = [diff - math.sqrt((p_t - l_t) ** 2 + (u_c - p_c) ** 2), diff + math.sqrt((u_t - p_t) ** 2 + (p_c - l_c) ** 2)]
    pooled = (x_c + x_t) / (n_c + n_t)
    se = math.sqrt(pooled * (1 - pooled) * (1 / n_c + 1 / n_t))
    p = float(2 * stats.norm.sf(abs(diff / se))) if se > 0 else 1.0
    return {"pC": p_c, "pT": p_t, "diff": diff, "ci": ci, "p": p}


def q10_from_two_temps(shelf_t1: float, t1: float, shelf_t2: float, t2: float) -> float:
    return (shelf_t1 / shelf_t2) ** (10 / (t2 - t1))


def extrapolate_shelf_life(shelf_at_t: float, t_test: float, t_target: float, q10: float) -> float:
    return shelf_at_t * q10 ** ((t_test - t_target) / 10)


def prediction_error(pairs: list[dict]) -> dict | None:
    if not pairs:
        return None
    e = np.array([p["predicted"] - p["observed"] for p in pairs], float)
    return {"n": int(e.size), "bias": float(e.mean()), "mae": float(np.abs(e).mean()), "rmse": float(math.sqrt((e ** 2).mean()))}


def decide(ci: list[float], th: dict) -> str:
    lo_, hi_ = ci
    if th["direction"] == "treatment-higher":
        if lo_ >= th["minimumDifference"]:
            return "meets-threshold"
        if hi_ < th["minimumDifference"]:
            return "does-not-meet"
        return "inconclusive"
    if hi_ <= -th["minimumDifference"]:
        return "meets-threshold"
    if lo_ > -th["minimumDifference"]:
        return "does-not-meet"
    return "inconclusive"


def claim_text(decision: str, th: dict, ci: list[float], ctx: dict) -> str:
    rng = f'{ci[0]:.2f} to {ci[1]:.2f} {th["unit"]}'
    if decision == "meets-threshold":
        return (f'In a comparative trial ({ctx["n"]}) of {ctx["commodity"]} over {ctx["days"]:g} days under {ctx["conditions"]}, {ctx["treatment"]} differed from '
                f'{ctx["control"]} in {th["metric"]} by {rng} (95% CI), meeting the pre-registered threshold of {th["minimumDifference"]:g} {th["unit"]}. '
                "This result applies to these conditions and does not establish a general shelf-life claim.")
    if decision == "inconclusive":
        return (f'The trial was inconclusive for {th["metric"]}: the 95% CI ({rng}) includes differences below the pre-registered threshold. '
                "No benefit claim should be made; consider a larger trial.")
    return f'The trial did not show the pre-registered improvement in {th["metric"]} (95% CI {rng}). No benefit claim is supported.'


def lock_hash(obj) -> str:
    """FNV-1a of the canonical JSON — identical to the web implementation for the same JSON text."""
    s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    units = s.encode("utf-16-le")
    h = 0x811C9DC5
    for i in range(0, len(units), 2):  # UTF-16 code units, like JavaScript's charCodeAt
        h ^= units[i] | (units[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"
