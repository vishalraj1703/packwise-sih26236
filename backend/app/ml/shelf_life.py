"""Optional predictive machine learning (scikit-learn + XGBoost).

Predicts a trial quality outcome (e.g. moisture at day d) for a food–packaging combination
from reviewed, locked trial observations. It is DISABLED until enough representative data
exists: the gate below must pass, and the model must beat the physics-based baseline on
held-out trials before its predictions are shown. Until then the engine's scientific models
are the only source of estimates.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import reference as ref
from ..db import Trial
from ..engine.barrier import structure_at_test

MIN_OBSERVATIONS = 60
MIN_TRIALS = 3
MIN_COMMODITIES = 2
TARGET_METRIC = "moisture"

_model = None
_meta: dict = {}


def _features(row: dict) -> list[float]:
    s = ref.get_structure(row["structureId"]) if row.get("structureId") else None
    at = structure_at_test(s) if s else {"otr": math.nan, "wvtr": math.nan}
    return [
        math.log10(max(at["wvtr"], 1e-3)) if not math.isnan(at["wvtr"]) else -3.0,
        math.log10(max(at["otr"], 1e-3)) if not math.isnan(at["otr"]) else -3.0,
        1.0 if row.get("oxygenControl", "none") != "none" else 0.0,
        float(row.get("storageTC", 30)), float(row.get("storageRh", 75)), float(row["day"]),
        float(int(hashlib.md5(row["commodityId"].encode()).hexdigest(), 16) % 997) / 997.0,  # stable food code
    ]


def collect(db: Session) -> list[dict]:
    """Treatment and control observations from locked trials whose arms name a PackWise structure."""
    rows = []
    for t in db.execute(select(Trial).where(Trial.locked_at.is_not(None))).scalars():
        d = t.design_json
        arms = {"control": d.get("controlStructureId"), "treatment": d.get("treatmentStructureId")}
        for o in t.observations_json or []:
            if o.get("metric") != TARGET_METRIC or not arms.get(o["arm"]):
                continue
            rows.append({"trialId": t.id, "commodityId": d["commodityId"], "structureId": arms[o["arm"]],
                         "oxygenControl": d.get(f'{o["arm"]}OxygenControl', "none"), "storageTC": d.get("storageTC", 30),
                         "storageRh": d.get("storageRh", 75), "day": o["day"], "value": o["value"]})
    return rows


def status(db: Session) -> dict:
    rows = collect(db)
    trials = {r["trialId"] for r in rows}
    commodities = {r["commodityId"] for r in rows}
    ready = len(rows) >= MIN_OBSERVATIONS and len(trials) >= MIN_TRIALS and len(commodities) >= MIN_COMMODITIES
    return {
        "enabled": _model is not None, "readyToTrain": ready, "target": TARGET_METRIC,
        "observations": len(rows), "trials": len(trials), "commodities": len(commodities),
        "requirements": {"observations": MIN_OBSERVATIONS, "trials": MIN_TRIALS, "commodities": MIN_COMMODITIES},
        "model": _meta or None,
        "note": "Predictive ML stays off until enough reviewed trial data exist and the model beats the physics baseline on held-out trials.",
    }


def train(db: Session) -> dict:
    """Train XGBoost (fallback: scikit-learn gradient boosting) with leave-one-trial-out validation."""
    global _model, _meta
    st = status(db)
    if not st["readyToTrain"]:
        return {**st, "trained": False, "reason": "Not enough reviewed trial data yet."}
    rows = collect(db)
    x = np.array([_features(r) for r in rows])
    y = np.array([r["value"] for r in rows])
    groups = np.array([r["trialId"] for r in rows])
    try:
        from xgboost import XGBRegressor

        make = lambda: XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.9)  # noqa: E731
        algo = "xgboost.XGBRegressor"
    except Exception:  # noqa: BLE001
        from sklearn.ensemble import GradientBoostingRegressor

        make = lambda: GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05)  # noqa: E731
        algo = "sklearn.GradientBoostingRegressor"
    from sklearn.model_selection import LeaveOneGroupOut

    errors, baseline = [], []
    for tr, te in LeaveOneGroupOut().split(x, y, groups):
        m = make().fit(x[tr], y[tr])
        errors.extend(np.abs(m.predict(x[te]) - y[te]))
        baseline.extend(np.abs(np.mean(y[tr]) - y[te]))
    mae, base_mae = float(np.mean(errors)), float(np.mean(baseline))
    if mae >= base_mae:
        _model, _meta = None, {"algorithm": algo, "heldOutMae": mae, "baselineMae": base_mae, "accepted": False}
        return {**status(db), "trained": False, "reason": "Model did not beat the baseline on held-out trials; predictions stay disabled."}
    _model = make().fit(x, y)
    _meta = {"algorithm": algo, "heldOutMae": mae, "baselineMae": base_mae, "accepted": True, "n": len(rows)}
    return {**status(db), "trained": True}


def predict(row: dict) -> dict | None:
    if _model is None:
        return None
    return {"prediction": float(_model.predict(np.array([_features(row)]))[0]), "heldOutMae": _meta["heldOutMae"], "algorithm": _meta["algorithm"]}
