"""Gap 5 — Trial and Verify: pre-registered comparative trials."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_role, require_user
from ..db import Trial, User, get_db, now_iso
from ..engine.trial import analyze_trial
from ..engine.validation import lock_hash

router = APIRouter(prefix="/api")


class Metric(BaseModel):
    key: str = Field(max_length=40)
    label: str = Field(max_length=80)
    unit: str = Field(max_length=20)
    type: str = Field(pattern="^(continuous|proportion)$")
    direction: str = Field(pattern="^(treatment-higher|treatment-lower)$")
    minimumDifference: float = Field(ge=0)


class Prediction(BaseModel):
    metric: str
    day: float
    predicted: float


class Design(BaseModel):
    commodityId: str
    control: str = Field(max_length=200)
    treatment: str = Field(max_length=200)
    conditions: str = Field(max_length=300)
    durationDays: float = Field(gt=0, le=730)
    checkpointsDays: list[float] = Field(max_length=20)
    unitsPerArm: int = Field(gt=0, le=10000)
    primaryMetric: str
    metrics: list[Metric] = Field(min_length=1, max_length=8)
    predictions: list[Prediction] | None = Field(default=None, max_length=60)
    assessmentId: int | None = None
    candidateKey: str | None = None
    expertReviewer: str | None = Field(default=None, max_length=80)
    controlStructureId: str | None = None
    treatmentStructureId: str | None = None
    treatmentOxygenControl: str | None = None
    storageTC: float | None = None
    storageRh: float | None = None


class TrialIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    design: Design


def _design(d: Design) -> dict:
    return d.model_dump(exclude_none=True)


def _load(db: Session, tid: int, user: User) -> Trial:
    t = db.get(Trial, tid)
    if not t or (t.user_id != user.id and user.role not in ("admin", "expert")):
        raise HTTPException(404, "Trial not found")
    return t


@router.post("/trials")
def create(body: TrialIn, user: User = Depends(require_role("producer", "expert")), db: Session = Depends(get_db)):
    if not any(m.key == body.design.primaryMetric for m in body.design.metrics):
        raise HTTPException(400, "Primary metric must be one of the metrics")
    t = Trial(user_id=user.id, assessment_id=body.design.assessmentId, title=body.title, design_json=_design(body.design), observations_json=[])
    db.add(t)
    db.commit()
    return {"id": t.id}


@router.get("/trials")
def list_trials(user: User = Depends(require_user), db: Session = Depends(get_db)):
    q = select(Trial).order_by(Trial.id.desc())
    if user.role not in ("admin", "expert"):
        q = q.where(Trial.user_id == user.id)
    return [{"id": t.id, "title": t.title, "status": t.status, "lockedAt": t.locked_at, "lockHash": t.lock_hash, "createdAt": t.created_at,
             "design": t.design_json, "observations": len(t.observations_json or [])} for t in db.execute(q).scalars()]


@router.get("/trials/{tid}")
def get_trial(tid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    t = _load(db, tid, user)
    integrity = lock_hash(t.design_json) == t.lock_hash if t.lock_hash else None
    return {"id": t.id, "title": t.title, "status": t.status, "lockedAt": t.locked_at, "lockHash": t.lock_hash, "integrity": integrity,
            "design": t.design_json, "observations": t.observations_json or [], "analysis": analyze_trial(t.design_json, t.observations_json or []) if t.locked_at else None}


@router.put("/trials/{tid}")
def update(tid: int, body: TrialIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    t = _load(db, tid, user)
    if t.locked_at:
        raise HTTPException(409, "This trial plan is locked. Thresholds cannot be changed after pre-registration.")
    t.title, t.design_json = body.title, _design(body.design)
    db.commit()
    return {"ok": True}


@router.post("/trials/{tid}/lock")
def lock(tid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    t = _load(db, tid, user)
    if t.locked_at:
        raise HTTPException(409, "Already locked")
    t.lock_hash, t.locked_at, t.status = lock_hash(t.design_json), now_iso(), "running"
    db.commit()
    return {"lockHash": t.lock_hash}


class Observation(BaseModel):
    arm: str = Field(pattern="^(control|treatment)$")
    metric: str
    day: float = Field(ge=0)
    value: float
    n: int | None = Field(default=None, gt=0)
    sampleId: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=200)


class ObsIn(BaseModel):
    observations: list[Observation] = Field(min_length=1, max_length=500)


@router.post("/trials/{tid}/observations")
def add_obs(tid: int, body: ObsIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    t = _load(db, tid, user)
    if not t.locked_at:
        raise HTTPException(409, "Lock (pre-register) the trial plan before recording results.")
    keys = {m["key"] for m in t.design_json["metrics"]}
    for o in body.observations:
        if o.metric not in keys:
            raise HTTPException(400, f"Unknown metric {o.metric}")
    stamped = [{**o.model_dump(exclude_none=True), "recordedAt": now_iso()} for o in body.observations]
    t.observations_json = [*(t.observations_json or []), *stamped]
    db.commit()
    return {"ok": True, "total": len(t.observations_json)}


@router.post("/trials/{tid}/complete")
def complete(tid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    t = _load(db, tid, user)
    if not t.locked_at:
        raise HTTPException(400, "Trial must be locked first")
    t.status = "completed"
    db.commit()
    return {"ok": True}
