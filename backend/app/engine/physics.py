"""Physical helpers shared by all engine modules (NumPy-vectorised where useful)."""
from __future__ import annotations

import math

import numpy as np

R_KJ = 0.008314  # kJ/(mol·K)
O2_MG_PER_CC_STP = 1.429
AIR_O2 = 0.209
AIR_CO2 = 0.0004


def psat(t_c):
    """Saturation vapour pressure of water in Pa (Magnus–Alduchov). Accepts scalars or arrays."""
    return 610.94 * np.exp((17.625 * np.asarray(t_c, dtype=float)) / (np.asarray(t_c, dtype=float) + 243.04))


def arrhenius(e_kj: float, t_ref_c: float, t_c):
    tr = t_ref_c + 273.15
    t = np.asarray(t_c, dtype=float) + 273.15
    return np.exp((e_kj / R_KJ) * (1 / tr - 1 / t))


def wb_to_db(wb):
    return wb / (100 - wb)


def db_to_wb(db):
    return 100 * db / (1 + db)


class Mulberry32:
    """Deterministic PRNG identical to the web engine's (so offline and server results match)."""

    def __init__(self, seed: int = 42):
        self.a = seed & 0xFFFFFFFF

    def __call__(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = _imul(t ^ (t >> 15), 1 | t)
        t = (t + _imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def uniforms(self, n: int) -> np.ndarray:
        return np.array([self() for _ in range(n)])


def _imul(a: int, b: int) -> int:
    return (a * b) & 0xFFFFFFFF


def rng(seed: int = 42) -> Mulberry32:
    return Mulberry32(seed)


def triangular_inv(u, lo: float, mode: float, hi: float):
    """Inverse CDF of the triangular distribution (vectorised over u)."""
    u = np.asarray(u, dtype=float)
    if hi <= lo:
        return np.full(u.shape, mode) if u.shape else mode
    c = (mode - lo) / (hi - lo)
    out = np.where(u < c, lo + np.sqrt(u * (hi - lo) * (mode - lo)), hi - np.sqrt((1 - u) * (hi - lo) * (hi - mode)))
    return out if u.shape else float(out)


def triangular(g: Mulberry32, lo: float, mode: float, hi: float, n: int | None = None):
    """Draw one (or n consecutive) triangular samples from the shared generator."""
    if n is None:
        return triangular_inv(g(), lo, mode, hi)
    return triangular_inv(g.uniforms(n), lo, mode, hi)


def summarize(samples) -> dict:
    s = np.asarray([x for x in np.ravel(samples) if np.isfinite(x)], dtype=float)
    if s.size == 0:
        return {"p10": math.nan, "p50": math.nan, "p90": math.nan, "n": 0}
    p10, p50, p90 = np.quantile(s, [0.1, 0.5, 0.9])
    return {"p10": float(p10), "p50": float(p50), "p90": float(p90), "n": int(s.size)}


def sig(x: float, n: int = 3) -> str:
    if x is None or not math.isfinite(x):
        return "∞" if (x is not None and x > 0) else "–"
    if x == 0:
        return "0"
    a = abs(x)
    if a >= 1e5:
        return f"{x:.1e}"
    d = max(0, n - 1 - math.floor(math.log10(a)))
    return f"{x:.{min(d, 4)}f}"


def lo(e: dict) -> float:
    return e.get("lo", e["value"]) if e.get("lo") is not None else e["value"]


def hi(e: dict) -> float:
    return e.get("hi", e["value"]) if e.get("hi") is not None else e["value"]
