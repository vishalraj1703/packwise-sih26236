"""Auth, journey, assessments, AI, reviews, real-life examples, reference data, documents, ML."""
from __future__ import annotations

import base64
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import reference as ref
from .. import storage
from ..auth import create_session, current_user, hash_password, require_role, require_user, sha256, user_dict, verify_password
from ..config import DATABASE_URL
from ..db import Assessment, Document, Review, SessionToken, User, VerifiedExample, get_db
from ..engine.journey import offline_journey
from ..engine.reassess import compact, compare_selected
from ..engine.recommend import ENGINE_VERSION, recommend
from ..engine.retrieval import search
from ..ml import shelf_life
from ..schemas import AssessmentInput, JourneyRequest, LoginRequest, RegisterRequest
from ..services import ai
from ..services.journey import analyze_journey, geocode

router = APIRouter(prefix="/api")


def _set_cookie(resp: Response, token: str, expires: str):
    resp.set_cookie("pw_session", token, httponly=True, samesite="lax", expires=datetime.fromisoformat(expires), path="/")


# ---------------- auth ----------------
@router.post("/auth/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    u = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not u or not verify_password(body.password, u.salt, u.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    token, expires = create_session(db, u.id)
    _set_cookie(response, token, expires)
    return {"user": user_dict(u), "token": token}


@router.post("/auth/register")
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none():
        raise HTTPException(409, "An account with this email exists")
    h, salt = hash_password(body.password)
    # Self-registration creates producer accounts; other roles are assigned by an admin.
    u = User(email=body.email.lower(), name=body.name, role="producer", org=body.org, password_hash=h, salt=salt)
    db.add(u)
    db.commit()
    token, expires = create_session(db, u.id)
    _set_cookie(response, token, expires)
    return {"user": user_dict(u), "token": token}


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    tok = request.cookies.get("pw_session") or request.headers.get("authorization", "")[7:]
    if tok:
        s = db.get(SessionToken, sha256(tok))
        if s:
            db.delete(s)
            db.commit()
    response.delete_cookie("pw_session", path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(user: User | None = Depends(current_user)):
    return {"user": user_dict(user) if user else None}


@router.get("/users")
def users(_: User = Depends(require_role("producer", "expert")), db: Session = Depends(get_db)):
    rows = db.execute(select(User).where(User.role.in_(["transporter", "retailer"])).order_by(User.role, User.name)).scalars()
    return [{"id": u.id, "name": u.name, "role": u.role, "org": u.org} for u in rows]


# ---------------- status & reference data (used by the web and the Flutter app) ----------------
@router.get("/status")
def status():
    return {"ai": ai.ai_available(), "libraryUpdated": ref.knowledge()["updated"], "time": datetime.now(timezone.utc).isoformat(),
            "engine": ENGINE_VERSION, "database": DATABASE_URL.split(":")[0].split("+")[0], "storage": storage.backend_name()}


@router.get("/reference/commodities")
def ref_commodities():
    imgs = ref.images()["foods"]
    return [{**c, "image": f'/images/{imgs[c["id"]]["file"]}' if c["id"] in imgs else None} for c in ref.commodities()]


@router.get("/reference/bundle")
def ref_bundle():
    """Everything a client needs to work offline: foods, packs, examples, library, images and credits."""
    return {"commodities": ref_commodities(), "structures": ref.structures(), "plainNames": ref.materials_data()["plainNames"],
            "examples": ref.examples_data(), "knowledge": ref.knowledge(), "images": ref.images(), "sources": ref.sources(),
            "version": ENGINE_VERSION}


@router.get("/knowledge")
def knowledge():
    return ref.knowledge()


# ---------------- journey ----------------
@router.get("/geocode")
async def geocode_route(q: str = ""):
    if len(q.strip()) < 2:
        return []
    try:
        return await geocode(q.strip())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "Place search unavailable (offline?). Enter coordinates or pick a saved place.") from e


@router.post("/journey/analyze")
async def journey(body: JourneyRequest):
    o, d = body.origin.model_dump(exclude_none=True), body.destination.model_dump(exclude_none=True)
    try:
        return await analyze_journey(o, d, body.departureDate, body.storageDays)
    except Exception:  # noqa: BLE001
        return offline_journey(o, d, body.departureDate)


# ---------------- assessments ----------------
@router.post("/assessments/compute")
def compute(body: AssessmentInput):
    return compact(recommend(body.engine_dict()))


class SaveAssessment(BaseModel):
    input: AssessmentInput
    title: str | None = Field(default=None, max_length=120)


@router.post("/assessments")
def save_assessment(body: SaveAssessment, user: User = Depends(require_user), db: Session = Depends(get_db)):
    inp = body.input.engine_dict()
    result = compact(recommend(inp))
    j = inp["journey"]
    a = Assessment(user_id=user.id, title=body.title or f'{result["commodity"]["name"]} — {j["origin"]["name"]} to {j["destination"]["name"]}',
                   commodity_id=inp["commodityId"], input_json=inp, result_json=result, engine_version=result["engineVersion"])
    db.add(a)
    db.commit()
    return {"id": a.id, "result": result}


@router.get("/assessments")
def list_assessments(user: User = Depends(require_user), db: Session = Depends(get_db)):
    q = select(Assessment).order_by(Assessment.id.desc())
    if user.role not in ("admin", "expert"):
        q = q.where(Assessment.user_id == user.id)
    return [{"id": a.id, "title": a.title, "commodity_id": a.commodity_id, "engine_version": a.engine_version, "selected_plan_id": a.selected_plan_id,
             "parent_id": a.parent_id, "created_at": a.created_at} for a in db.execute(q.limit(200)).scalars()]


def _load(db: Session, aid: int, user: User) -> Assessment:
    a = db.get(Assessment, aid)
    if not a or (a.user_id != user.id and user.role not in ("admin", "expert")):
        raise HTTPException(404, "Assessment not found")
    return a


@router.get("/assessments/{aid}")
def get_assessment(aid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    a = _load(db, aid, user)
    return {"id": a.id, "title": a.title, "input": a.input_json, "result": a.result_json, "selectedPlanId": a.selected_plan_id, "parentId": a.parent_id, "createdAt": a.created_at}


class SelectPlan(BaseModel):
    planId: str


@router.post("/assessments/{aid}/select")
def select_plan(aid: int, body: SelectPlan, user: User = Depends(require_user), db: Session = Depends(get_db)):
    a = _load(db, aid, user)
    if not any(p["id"] == body.planId for p in a.result_json["plans"]):
        raise HTTPException(400, "Unknown plan")
    a.selected_plan_id = body.planId
    db.commit()
    return {"ok": True}


class Reassess(BaseModel):
    input: dict
    note: str | None = Field(default=None, max_length=200)


@router.post("/assessments/{aid}/reassess")
def reassess(aid: int, body: Reassess, user: User = Depends(require_user), db: Session = Depends(get_db)):
    a = _load(db, aid, user)
    inp = AssessmentInput.model_validate({**a.input_json, **body.input}).engine_dict()
    before = a.result_json
    after = compact(recommend(inp))
    comparison = compare_selected(before, after, a.selected_plan_id or (before["plans"][0]["id"] if before["plans"] else None))
    child = Assessment(user_id=user.id, title=f'{a.title} — reassessed' + (f": {body.note}" if body.note else ""), commodity_id=inp["commodityId"],
                       input_json=inp, result_json=after, engine_version=after["engineVersion"], parent_id=a.id)
    db.add(child)
    db.commit()
    return {"id": child.id, "comparison": comparison, "result": after}


# ---------------- AI (optional hosted LLM) ----------------
def _ai(fn, *args):
    try:
        return fn(*args)
    except ai.AiError as e:
        raise HTTPException(e.status, str(e)) from e


@router.post("/ai/identify")
async def ai_identify(photo: UploadFile = File(...)):
    if photo.content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(400, "Use a JPEG, PNG or WebP photo")
    data = await photo.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "File too large")
    return _ai(ai.identify_food, base64.b64encode(data).decode(), photo.content_type)


@router.post("/ai/extract")
async def ai_extract(report: UploadFile = File(...)):
    if report.content_type not in ("application/pdf", "image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Use a PDF or image")
    data = await report.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "File too large")
    return _ai(ai.extract_report, base64.b64encode(data).decode(), report.content_type)


class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[dict] = Field(default_factory=list, max_length=20)
    context: str = Field(default="", max_length=6000)
    language: str = Field(default="English", max_length=20)


@router.post("/ai/chat")
def ai_chat(body: ChatIn):
    updated = ref.knowledge()["updated"]
    passages = [{"id": h["article"]["id"], "title": h["article"]["title"], "text": h["article"]["text"], "updated": updated} for h in search(body.question, 4)]
    history = [{"role": m.get("role"), "content": str(m.get("content", ""))[:4000]} for m in body.history if m.get("role") in ("user", "assistant")]
    answer = _ai(ai.grounded_answer, body.question, history, passages, body.context, body.language)
    return {"answer": answer, "passages": [{"id": p["id"], "title": p["title"]} for p in passages], "mode": "online"}


@router.get("/knowledge/search")
def knowledge_search(q: str):
    return [{"id": h["article"]["id"], "title": h["article"]["title"], "score": h["score"]} for h in search(q, 5)]


# ---------------- expert review of seed data ----------------
@router.get("/reviews")
def reviews(db: Session = Depends(get_db)):
    out = []
    for r in db.execute(select(Review).order_by(Review.id.desc())).scalars():
        reviewer = db.get(User, r.reviewer_id) if r.reviewer_id else None
        out.append({**r.as_dict(), "reviewer": reviewer.name if reviewer else None})
    return out


class ReviewIn(BaseModel):
    entity: str = Field(pattern="^(commodity|material|structure|article|rule)$")
    entityId: str
    decision: str = Field(pattern="^(approved|needs-change|rejected)$")
    notes: str | None = Field(default=None, max_length=2000)


@router.post("/reviews")
def add_review(body: ReviewIn, user: User = Depends(require_role("expert")), db: Session = Depends(get_db)):
    r = Review(entity=body.entity, entity_id=body.entityId, reviewer_id=user.id, decision=body.decision, notes=body.notes)
    db.add(r)
    db.commit()
    return {"id": r.id}


# ---------------- verified real-life examples ----------------
@router.get("/examples")
def examples(db: Session = Depends(get_db)):
    out = []
    for e in db.execute(select(VerifiedExample).order_by(VerifiedExample.id.desc())).scalars():
        reviewer = db.get(User, e.reviewer_id) if e.reviewer_id else None
        out.append({**e.as_dict(), "reviewer": reviewer.name if reviewer else None})
    return out


@router.post("/examples")
async def add_example(structureId: str = Form(...), product: str = Form(..., min_length=2, max_length=120), brand: str = Form(..., min_length=1, max_length=80),
                      photoSource: str = Form(..., min_length=3, max_length=300), documentedStructure: str = Form(..., min_length=3, max_length=300),
                      structureSource: str = Form(..., min_length=3, max_length=300), sourceDate: str = Form(..., min_length=8, max_length=20),
                      commodityId: str = Form(""), labelledShelfLife: str = Form(""), storageInstructions: str = Form(""),
                      photo: UploadFile | None = File(None), user: User = Depends(require_role("expert")), db: Session = Depends(get_db)):
    if not photo or photo.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "A product photo (JPEG/PNG/WebP) is required")
    try:
        ref.get_structure(structureId)
    except KeyError as e:
        raise HTTPException(400, "Unknown structure") from e
    data = await photo.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "File too large")
    key = storage.put("examples", data, photo.content_type, photo.filename)
    e = VerifiedExample(structure_id=structureId, commodity_id=commodityId or None, product=product, brand=brand, photo_path=f"/uploads/{key}", photo_source=photoSource,
                        documented_structure=documentedStructure, structure_source=structureSource, labelled_shelf_life=labelledShelfLife or None,
                        storage_instructions=storageInstructions or None, source_date=sourceDate, reviewer_id=user.id)
    db.add(e)
    db.commit()
    return {"id": e.id}


@router.delete("/examples/{eid}")
def delete_example(eid: int, _: User = Depends(require_role("expert")), db: Session = Depends(get_db)):
    e = db.get(VerifiedExample, eid)
    if e:
        storage.delete(e.photo_path.removeprefix("/uploads/"))
        db.delete(e)
        db.commit()
    return {"ok": True}


# ---------------- evidence documents (datasheets, lab reports) in object storage ----------------
@router.post("/documents")
async def upload_document(kind: str = Form(..., pattern="^(datasheet|lab-report|photo|other)$"), note: str = Form(""), file: UploadFile = File(...),
                          user: User = Depends(require_user), db: Session = Depends(get_db)):
    if file.content_type not in ("application/pdf", "image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Use a PDF or image")
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "File too large")
    key = storage.put(f"documents/{user.id}", data, file.content_type, file.filename)
    d = Document(owner_id=user.id, kind=kind, key=key, content_type=file.content_type, size_bytes=len(data), note=note or None)
    db.add(d)
    db.commit()
    return {"id": d.id, "url": f"/uploads/{key}"}


@router.get("/documents")
def documents(user: User = Depends(require_user), db: Session = Depends(get_db)):
    q = select(Document).order_by(Document.id.desc())
    if user.role not in ("admin", "expert"):
        q = q.where(Document.owner_id == user.id)
    return [{**d.as_dict(), "url": f"/uploads/{d.key}"} for d in db.execute(q).scalars()]


# ---------------- predictive ML (gated) ----------------
@router.get("/ml/status")
def ml_status(db: Session = Depends(get_db)):
    return shelf_life.status(db)


@router.post("/ml/train")
def ml_train(_: User = Depends(require_role("expert")), db: Session = Depends(get_db)):
    t = time.time()
    out = shelf_life.train(db)
    return {**out, "seconds": round(time.time() - t, 2)}
