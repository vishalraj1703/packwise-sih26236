"""Sourcing, packing records, QR traceability, shipments, simulated retail billing and consumer issues."""
from __future__ import annotations

import io
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import reference as ref
from .. import storage
from ..auth import current_user, require_role, require_user, sha256, user_from_api_key
from ..db import Assessment, Batch, Complaint, Event, MaterialLot, QuoteRequest, RetailSale, Shipment, ShipmentBatch, User, get_db, now_iso
from ..engine.barrier import recyclability
from .common import base_url, row

router = APIRouter(prefix="/api")


def _token() -> str:
    return secrets.token_urlsafe(8)


def _product(pid: str) -> dict | None:
    return next((p for p in ref.supplier_products() if p["id"] == pid), None)


# ---------------- sourcing ----------------
@router.get("/suppliers")
def suppliers():
    return {"suppliers": ref.suppliers(), "products": ref.supplier_products()}


class QuoteIn(BaseModel):
    assessmentId: int | None = None
    supplierId: str
    supplierProductId: str | None = None
    kind: str = Field(pattern="^(quotation|sample|packing-service)$")
    units: int = Field(gt=0, le=1_000_000)
    sizeKg: float | None = Field(default=None, gt=0)
    message: str | None = Field(default=None, max_length=1000)


def _size_key(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else str(x)


@router.post("/quotes")
def quote(body: QuoteIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    sup = ref.get_supplier(body.supplierId)
    if not sup:
        raise HTTPException(404, "Unknown supplier")
    valid_until = (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat()
    if body.kind == "packing-service":
        ps = sup.get("packingService")
        if not ps:
            raise HTTPException(400, "This supplier does not offer packing services")
        response = {"simulated": True, "pricePerPackInr": ps["pricePerPackInr"], "minChargeInr": ps["minChargeInr"], "totalInr": max(ps["minChargeInr"], ps["pricePerPackInr"] * body.units),
                    "methods": ps["methods"], "validUntil": valid_until, "note": "Simulated quotation — no booking has been made."}
    else:
        p = _product(body.supplierProductId or "")
        key = _size_key(body.sizeKg) if body.sizeKg else None
        if not p or p["supplierId"] != body.supplierId or not key or key not in p["unitPriceInr"]:
            raise HTTPException(400, "Product/size not offered by this supplier")
        unit = p["unitPriceInr"][key]
        if body.kind == "sample":
            n = min(body.units, 10)
            response = {"simulated": True, "sampleUnits": n, "chargeInr": 0 if n <= 5 else (n - 5) * unit, "courierInr": 120, "dispatchDays": 3,
                        "documentation": p["documentation"], "declared": p["declared"], "validUntil": valid_until, "note": "Simulated sample request — nothing has been ordered."}
        else:
            buy = max(body.units, p["moqUnits"])
            response = {"simulated": True, "unitPriceInr": unit, "unitsQuoted": buy, "moqUnits": p["moqUnits"], "setupCostInr": p["setupCostInr"], "leadTimeDays": p["leadTimeDays"],
                        "subtotalInr": buy * unit + p["setupCostInr"], "gstPct": 18, "documentation": p["documentation"], "declared": p["declared"],
                        "substitutionTerms": "No material substitution without written approval (requested).", "validUntil": valid_until,
                        "note": "Simulated quotation — no purchase has been made."}
    q = QuoteRequest(user_id=user.id, assessment_id=body.assessmentId, supplier_id=body.supplierId, supplier_product_id=body.supplierProductId, kind=body.kind,
                     units=body.units, size_kg=body.sizeKg, message=body.message, response_json=response)
    db.add(q)
    db.commit()
    return {"id": q.id, "supplier": sup["name"], "response": response}


@router.get("/quotes")
def quotes(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.execute(select(QuoteRequest).where(QuoteRequest.user_id == user.id).order_by(QuoteRequest.id.desc())).scalars()
    return [row(q, response=q.response_json, supplier=(ref.get_supplier(q.supplier_id) or {}).get("name")) for q in rows]


class Checks(BaseModel):
    technicalMatch: bool
    dimensionsOk: bool
    lotMatchesOrder: bool
    sampleSealOk: bool
    documentsReceived: bool
    notes: str | None = Field(default=None, max_length=1000)


class LotIn(BaseModel):
    supplierProductId: str
    lotCode: str = Field(min_length=2, max_length=40)
    receivedAt: str
    unitsReceived: int = Field(gt=0)
    checks: Checks


@router.post("/material-lots")
def add_lot(body: LotIn, user: User = Depends(require_role("producer")), db: Session = Depends(get_db)):
    if not _product(body.supplierProductId):
        raise HTTPException(400, "Unknown supplier product")
    c = body.checks
    accepted = c.technicalMatch and c.dimensionsOk and c.lotMatchesOrder and c.sampleSealOk
    lot = MaterialLot(user_id=user.id, supplier_product_id=body.supplierProductId, lot_code=body.lotCode, received_at=body.receivedAt, units_received=body.unitsReceived,
                      receiving_check_json=c.model_dump(), accepted=accepted)
    db.add(lot)
    db.commit()
    return {"id": lot.id, "accepted": accepted}


@router.get("/material-lots")
def lots(user: User = Depends(require_user), db: Session = Depends(get_db)):
    q = select(MaterialLot).order_by(MaterialLot.id.desc())
    if user.role not in ("admin", "expert"):
        q = q.where(MaterialLot.user_id == user.id)
    out = []
    for l in db.execute(q).scalars():
        p = _product(l.supplier_product_id)
        out.append(row(l, checks=l.receiving_check_json, structureId=p["structureId"] if p else None,
                       structureName=ref.get_structure(p["structureId"])["name"] if p else "?", supplier=ref.get_supplier(p["supplierId"])["name"] if p else "?"))
    return out


# ---------------- batches & QR ----------------
def _batch_code(db: Session, commodity_id: str) -> str:
    n = (db.execute(select(func.count(Batch.id))).scalar() or 0) + 1
    return f'PW{datetime.now().strftime("%y%m%d")}-{commodity_id[:3].upper()}-{n:04d}'


class BatchIn(BaseModel):
    assessmentId: int | None = None
    candidateKey: str | None = None
    materialLotId: int | None = None
    commodityId: str
    state: str | None = None
    origin: str = Field(max_length=160)
    harvestDate: str | None = None
    packedAt: str
    quantityKg: float = Field(gt=0)
    units: int = Field(gt=0, le=100000)
    packSizeKg: float = Field(gt=0)
    structureId: str
    oxygenControl: str | None = None
    gtin: str | None = Field(default=None, pattern=r"^\d{8,14}$")
    packingChecks: dict


@router.post("/batches")
def create_batch(body: BatchIn, request: Request, user: User = Depends(require_role("producer")), db: Session = Depends(get_db)):
    warnings = []
    rec_version = None
    try:
        c = ref.get_commodity(body.commodityId)
        s = ref.get_structure(body.structureId)
    except KeyError as e:
        raise HTTPException(400, str(e)) from e
    if body.assessmentId:
        a = db.get(Assessment, body.assessmentId)
        if not a or a.user_id != user.id:
            raise HTTPException(404, "Assessment not found")
        rec_version = f"{a.engine_version} / assessment #{a.id}"
        cand = next((x for p in a.result_json["portions"] for x in p["candidates"] if x["key"] == body.candidateKey), None)
        if cand and cand["structureId"] != body.structureId:
            warnings.append(f'Packaging actually used ({s["name"]}) differs from the recommended option ({cand["structureName"]}). The recommendation does not apply to this batch.')
    supplier_product_id = None
    if body.materialLotId:
        lot = db.get(MaterialLot, body.materialLotId)
        if not lot or lot.user_id != user.id:
            raise HTTPException(404, "Material lot not found")
        supplier_product_id = lot.supplier_product_id
        if _product(lot.supplier_product_id)["structureId"] != body.structureId:
            warnings.append("The selected material lot is a different structure from the one recorded for this batch.")
        if not lot.accepted:
            warnings.append("This material lot did not pass the receiving check.")
    else:
        warnings.append("No material lot linked — defective-lot investigation will not be possible for this batch.")
    rec = recyclability(s)
    b = Batch(public_token=_token(), batch_code=_batch_code(db, body.commodityId), gtin=body.gtin, producer_id=user.id, assessment_id=body.assessmentId,
              candidate_key=body.candidateKey, recommendation_version=rec_version, commodity_id=c["id"], commodity_name=c["name"], state=body.state or c["defaultState"],
              origin=body.origin, harvest_date=body.harvestDate, packed_at=body.packedAt, quantity_kg=body.quantityKg, units=body.units, pack_size_kg=body.packSizeKg,
              structure_id=s["id"], structure_name=s["name"], oxygen_control=body.oxygenControl or "none", material_lot_id=body.materialLotId,
              supplier_product_id=supplier_product_id, packing_checks_json=body.packingChecks,
              handling_json={"storage": c["storageAdvice"], "disposal": rec["label"], "pwmCategory": rec["pwmCategory"], "packaging": s["name"], "oxygenControl": body.oxygenControl or "none"})
    db.add(b)
    db.flush()
    db.add(Event(type="packed", batch_id=b.id, actor_id=user.id, actor_role=user.role, event_time=body.packedAt, location=body.origin, units=body.units, notes=" ".join(warnings) or None))
    db.commit()
    return {"id": b.id, "batchCode": b.batch_code, "publicToken": b.public_token, "publicUrl": f"{base_url(request)}/t/{b.public_token}", "warnings": warnings}


def _can_see(db: Session, user: User, b: Batch) -> bool:
    if user.role in ("admin", "expert") or b.producer_id == user.id:
        return True
    q = select(ShipmentBatch).join(Shipment, Shipment.id == ShipmentBatch.shipment_id).where(
        ShipmentBatch.batch_id == b.id, or_(Shipment.transporter_id == user.id, Shipment.receiver_id == user.id))
    return db.execute(q).first() is not None


@router.get("/batches")
def batches(user: User = Depends(require_user), db: Session = Depends(get_db)):
    if user.role in ("admin", "expert"):
        rows = db.execute(select(Batch).order_by(Batch.id.desc())).scalars().all()
    elif user.role == "producer":
        rows = db.execute(select(Batch).where(Batch.producer_id == user.id).order_by(Batch.id.desc())).scalars().all()
    else:
        rows = db.execute(select(Batch).join(ShipmentBatch, ShipmentBatch.batch_id == Batch.id).join(Shipment, Shipment.id == ShipmentBatch.shipment_id)
                          .where(or_(Shipment.transporter_id == user.id, Shipment.receiver_id == user.id)).distinct().order_by(Batch.id.desc())).scalars().all()
    counts = dict(db.execute(select(Complaint.batch_id, func.count()).group_by(Complaint.batch_id)).all())
    return [row(b, complaints=counts.get(b.id, 0)) for b in rows]


def _events_for_batch(db: Session, b: Batch, extra_batch_ids: list[int] | None = None) -> list[Event]:
    ids = [b.id] + (extra_batch_ids or [])
    ship_ids = [s for (s,) in db.execute(select(ShipmentBatch.shipment_id).where(ShipmentBatch.batch_id.in_(ids))).all()]
    q = select(Event).where(or_(Event.batch_id.in_(ids), Event.shipment_id.in_(ship_ids or [-1]))).order_by(Event.event_time, Event.id)
    return db.execute(q).scalars().all()


@router.get("/batches/{bid}")
def batch_detail(bid: int, request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    b = db.get(Batch, bid)
    if not b or not _can_see(db, user, b):
        raise HTTPException(404, "Batch not found")
    names = {u.id: u.name for u in db.execute(select(User)).scalars()}
    events = [row(e, actor_name=names.get(e.actor_id)) for e in _events_for_batch(db, b)]
    shipments = []
    for sb in db.execute(select(ShipmentBatch).where(ShipmentBatch.batch_id == b.id)).scalars():
        s = db.get(Shipment, sb.shipment_id)
        shipments.append(row(s, units=sb.units, transporter=names.get(s.transporter_id), receiver=names.get(s.receiver_id)))
    children = [{"id": c.id, "batch_code": c.batch_code, "units": c.units, "quantity_kg": c.quantity_kg} for c in db.execute(select(Batch).where(Batch.parent_batch_id == b.id)).scalars()]
    parent = db.get(Batch, b.parent_batch_id) if b.parent_batch_id else None
    lot = db.get(MaterialLot, b.material_lot_id) if b.material_lot_id else None
    sales = [row(s) for s in db.execute(select(RetailSale).where(RetailSale.batch_id == b.id).order_by(RetailSale.sold_at.desc())).scalars()]
    complaints = ([row(c) for c in db.execute(select(Complaint).where(Complaint.batch_id == b.id).order_by(Complaint.id.desc())).scalars()]
                  if b.producer_id == user.id or user.role in ("admin", "expert") else [])
    return {"batch": row(b, packingChecks=b.packing_checks_json or {}, handling=b.handling_json or {}), "events": events, "shipments": shipments, "children": children,
            "parent": {"id": parent.id, "batch_code": parent.batch_code} if parent else None, "lot": row(lot) if lot else None, "sales": sales, "complaints": complaints,
            "publicUrl": f"{base_url(request)}/t/{b.public_token}"}


@router.get("/qr/{token}.svg")
def qr(token: str, request: Request, db: Session = Depends(get_db)):
    b = db.execute(select(Batch).where(Batch.public_token == token)).scalar_one_or_none()
    if not b:
        raise HTTPException(404)
    img = qrcode.make(f"{base_url(request)}/t/{b.public_token}", image_factory=qrcode.image.svg.SvgPathImage, border=1,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml")


class Part(BaseModel):
    units: int = Field(gt=0)
    note: str | None = Field(default=None, max_length=200)


class SplitIn(BaseModel):
    parts: list[Part] = Field(min_length=2, max_length=10)
    reason: str = Field(pattern="^(split|repack)$")


@router.post("/batches/{bid}/split")
def split(bid: int, body: SplitIn, user: User = Depends(require_role("producer", "retailer")), db: Session = Depends(get_db)):
    b = db.get(Batch, bid)
    if not b or not _can_see(db, user, b):
        raise HTTPException(404, "Batch not found")
    total = sum(p.units for p in body.parts)
    if total > b.units:
        raise HTTPException(400, f"Parts add up to {total} units but the batch has {b.units}")
    created = []
    cols = {k: v for k, v in b.as_dict().items() if k not in ("id", "public_token", "batch_code", "quantity_kg", "units", "parent_batch_id", "created_at", "status")}
    for i, p in enumerate(body.parts):
        child = Batch(**cols, public_token=_token(), batch_code=f"{b.batch_code}-{chr(65 + i)}", quantity_kg=p.units * b.pack_size_kg, units=p.units, parent_batch_id=b.id)
        db.add(child)
        db.flush()
        db.add(Event(type=body.reason, batch_id=child.id, actor_id=user.id, actor_role=user.role, event_time=now_iso(), units=p.units,
                     notes=f"From {b.batch_code}" + (f": {p.note}" if p.note else "")))
        created.append({"id": child.id, "code": child.batch_code})
    db.add(Event(type=body.reason, batch_id=b.id, actor_id=user.id, actor_role=user.role, event_time=now_iso(), units=total, notes="Into " + ", ".join(c["code"] for c in created)))
    db.commit()
    return {"created": created}


# ---------------- shipments ----------------
class Declared(BaseModel):
    vehicle: str
    temperature: str | None = None
    notes: str | None = Field(default=None, max_length=500)


class Alloc(BaseModel):
    batchId: int
    units: int = Field(gt=0)


class ShipmentIn(BaseModel):
    origin: str = Field(max_length=160)
    destination: str = Field(max_length=160)
    transporterId: int | None = None
    receiverId: int | None = None
    declaredConditions: Declared
    batches: list[Alloc] = Field(min_length=1)


@router.post("/shipments")
def create_shipment(body: ShipmentIn, user: User = Depends(require_role("producer")), db: Session = Depends(get_db)):
    for x in body.batches:
        bt = db.get(Batch, x.batchId)
        if not bt or bt.producer_id != user.id:
            raise HTTPException(404, f"Batch {x.batchId} not found")
        shipped = db.execute(select(func.coalesce(func.sum(ShipmentBatch.units), 0)).where(ShipmentBatch.batch_id == x.batchId)).scalar()
        if shipped + x.units > bt.units:
            raise HTTPException(400, f"Only {bt.units - shipped} units of {bt.batch_code} remain unshipped")
    s = Shipment(code=f"SH-{int(time.time() * 1000):X}", created_by=user.id, origin=body.origin, destination=body.destination, transporter_id=body.transporterId,
                 receiver_id=body.receiverId, declared_conditions_json=body.declaredConditions.model_dump(exclude_none=True))
    db.add(s)
    db.flush()
    for x in body.batches:
        db.add(ShipmentBatch(shipment_id=s.id, batch_id=x.batchId, units=x.units))
    db.commit()
    return {"id": s.id, "code": s.code}


@router.get("/shipments")
def shipments(user: User = Depends(require_user), db: Session = Depends(get_db)):
    q = select(Shipment).order_by(Shipment.id.desc())
    if user.role not in ("admin", "expert"):
        q = q.where(or_(Shipment.created_by == user.id, Shipment.transporter_id == user.id, Shipment.receiver_id == user.id))
    out = []
    for s in db.execute(q).scalars():
        bs = [{"id": b.id, "batch_code": b.batch_code, "commodity_name": b.commodity_name, "units": sb.units}
              for sb, b in db.execute(select(ShipmentBatch, Batch).join(Batch, Batch.id == ShipmentBatch.batch_id).where(ShipmentBatch.shipment_id == s.id)).all()]
        evs = [{"type": e.type, "event_time": e.event_time, "location": e.location, "units": e.units, "condition_json": row(e)["condition_json"], "notes": e.notes, "actor_role": e.actor_role}
               for e in db.execute(select(Event).where(Event.shipment_id == s.id).order_by(Event.event_time)).scalars()]
        out.append(row(s, declared=s.declared_conditions_json or {}, batches=bs, events=evs))
    return out


class Condition(BaseModel):
    damagedUnits: int | None = Field(default=None, ge=0)
    temperatureC: float | None = None
    remarks: str | None = Field(default=None, max_length=500)


class EventIn(BaseModel):
    type: str = Field(pattern="^(dispatch|handoff|receipt|storage-check)$")
    location: str | None = Field(default=None, max_length=120)
    units: int | None = Field(default=None, ge=0)
    condition: Condition | None = None
    time: str | None = None


@router.post("/shipments/{sid}/events")
def shipment_event(sid: int, body: EventIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    s = db.get(Shipment, sid)
    if not s:
        raise HTTPException(404, "Shipment not found")
    allowed = ((body.type == "dispatch" and user.id in (s.created_by, s.transporter_id)) or
               (body.type == "handoff" and user.id == s.transporter_id) or
               (body.type == "receipt" and (user.id == s.receiver_id or (s.receiver_id is None and user.role == "retailer"))) or
               (body.type == "storage-check" and user.id in (s.receiver_id, s.created_by)))
    if not allowed and user.role != "admin":
        raise HTTPException(403, f"Your account is not authorised to record '{body.type}' for this shipment")
    if body.type in ("receipt", "handoff") and s.status not in ("dispatched", "in-transit"):
        raise HTTPException(400, f'{"Receipt" if body.type == "receipt" else "Handoff"} can only be recorded after dispatch')
    shipped = db.execute(select(func.coalesce(func.sum(ShipmentBatch.units), 0)).where(ShipmentBatch.shipment_id == s.id)).scalar()
    warnings = []
    if body.type == "receipt" and body.units is not None and body.units != shipped:
        warnings.append(f"Received {body.units} units but {shipped} were dispatched — discrepancy recorded.")
    db.add(Event(type=body.type, shipment_id=s.id, actor_id=user.id, actor_role=user.role, event_time=body.time or now_iso(), location=body.location, units=body.units,
                 condition_json=body.condition.model_dump(exclude_none=True) if body.condition else None))
    order = ["created", "dispatched", "in-transit", "received"]
    nxt = {"dispatch": "dispatched", "handoff": "in-transit", "receipt": "received"}.get(body.type, s.status)
    if order.index(nxt) >= order.index(s.status):
        s.status = nxt
        if body.type == "receipt" and s.receiver_id is None:
            s.receiver_id = user.id
    db.commit()
    return {"ok": True, "warnings": warnings}


# ---------------- simulated retail billing (POS) ----------------
class SaleIn(BaseModel):
    code: str = Field(min_length=3, max_length=60)
    quantity: int = Field(default=1, gt=0, le=1000)
    store: str | None = Field(default=None, max_length=120)
    gtin: str | None = None
    soldAt: str | None = None


@router.post("/pos/sale")
def pos_sale(body: SaleIn, user: User | None = Depends(current_user), x_api_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    via_api = user is None
    user = user or user_from_api_key(db, x_api_key)
    if not user or user.role not in ("retailer", "admin"):
        raise HTTPException(401, "Retailer session or X-API-Key required")
    code = body.code.strip()
    m = re.match(r"^(.*)-U(\d{4,6})$", code)
    batch_code = m.group(1) if m else code
    b = db.execute(select(Batch).where(Batch.batch_code == batch_code)).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Code not recognised. A product barcode (GTIN) alone identifies the product type, not the batch — scan the batch/unit QR or enter the batch code.")
    unit = None
    if m:
        if not 1 <= int(m.group(2)) <= b.units:
            raise HTTPException(400, "Unit number outside this batch")
        unit = code
    warnings = []
    received = db.execute(select(Shipment).join(ShipmentBatch, ShipmentBatch.shipment_id == Shipment.id).where(
        ShipmentBatch.batch_id.in_([b.id, b.parent_batch_id or -1]), Shipment.receiver_id == user.id, Shipment.status == "received")).first()
    if not received:
        warnings.append("No recorded receipt of this batch at your store — sale recorded but flagged for review.")
    if unit and db.execute(select(RetailSale).where(RetailSale.unit_serial == unit)).first():
        warnings.append("This unit was already recorded as sold — possible duplicate scan.")
    sold_at = body.soldAt or now_iso()
    db.add(RetailSale(retailer_id=user.id, batch_id=b.id, gtin=body.gtin or b.gtin, batch_code=b.batch_code, unit_serial=unit, quantity=body.quantity,
                      store=body.store or user.org, source="api" if via_api else "pos-simulator", sold_at=sold_at))
    db.add(Event(type="retail-sale", batch_id=b.id, actor_id=user.id, actor_role=user.role, event_time=sold_at, location=body.store or user.org, units=body.quantity,
                 notes=f"Unit {unit}" if unit else None))
    db.commit()
    return {"ok": True, "batchCode": b.batch_code, "commodity": b.commodity_name, "unitSerial": unit, "warnings": warnings}


@router.get("/pos/sales")
def pos_sales(user: User = Depends(require_role("retailer")), db: Session = Depends(get_db)):
    return [row(s) for s in db.execute(select(RetailSale).where(RetailSale.retailer_id == user.id).order_by(RetailSale.id.desc()).limit(200)).scalars()]


@router.post("/pos/api-key")
def pos_api_key(user: User = Depends(require_role("retailer")), db: Session = Depends(get_db)):
    key = f"pwk_{secrets.token_urlsafe(18)}"
    db.get(User, user.id).api_key_hash = sha256(key)
    db.commit()
    return {"apiKey": key, "note": "Shown once. Send it as the X-API-Key header from your billing software."}


# ---------------- public scan page & consumer issues ----------------
@router.get("/public/batch/{token}")
def public_batch(token: str, db: Session = Depends(get_db)):
    """Read-only: a public scan never changes shipment status."""
    b = db.execute(select(Batch).where(Batch.public_token == token)).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "This code is not recognised")
    producer = db.get(User, b.producer_id) if b.producer_id else None
    ids = [b.id] + ([b.parent_batch_id] if b.parent_batch_id else [])
    events = [e for e in _events_for_batch(db, b, ids[1:]) if e.type in ("packed", "dispatch", "handoff", "receipt", "split", "repack")]
    c = ref.get_commodity(b.commodity_id)
    parent = db.get(Batch, b.parent_batch_id) if b.parent_batch_id else None
    img = ref.images()["foods"].get(b.commodity_id)
    return {
        "batchCode": b.batch_code, "commodity": b.commodity_name, "names": c["names"], "state": b.state, "origin": b.origin,
        "producer": (producer.org if producer else None) or "Registered producer", "packedAt": b.packed_at, "harvestDate": b.harvest_date,
        "packaging": f"{ref.plain_name(b.structure_id)} ({b.structure_name})" if b.structure_id else b.structure_name, "oxygenControl": b.oxygen_control,
        "handling": b.handling_json or {}, "parentBatch": parent.batch_code if parent else None, "image": f'/images/{img["file"]}' if img else None,
        "events": [{"type": e.type, "time": e.event_time, "location": e.location, "by": e.actor_role} for e in events],
        "note": "This page shows packing and handling records. It is not a shelf-life or quality guarantee.",
    }


_recent: dict[str, list[float]] = {}


@router.post("/public/batch/{token}/complaint")
async def complaint(token: str, request: Request, category: str = Form(..., pattern="^(damaged-pack|leaking-seal|moisture-soft|rancid-smell|mould-insects|foreign-matter|wrong-quantity|other)$"),
                    description: str = Form(..., min_length=5, max_length=2000), unitSerial: str = Form(""), contactName: str = Form(""), contactPhone: str = Form(""),
                    contactEmail: str = Form(""), consent: str = Form(""), photos: list[UploadFile] | None = File(None), db: Session = Depends(get_db)):
    b = db.execute(select(Batch).where(Batch.public_token == token)).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "This code is not recognised")
    ip = request.client.host if request.client else "?"
    now = time.time()
    hits = [t for t in _recent.get(ip, []) if now - t < 3600] + [now]
    _recent[ip] = hits
    if len(hits) > 10:
        raise HTTPException(429, "Too many reports from this connection — please try later")
    paths = []
    for f in (photos or [])[:3]:
        if f.content_type in ("image/jpeg", "image/png", "image/webp"):
            data = await f.read()
            if len(data) <= 5 * 1024 * 1024:
                paths.append("/uploads/" + storage.put("complaints", data, f.content_type, f.filename))
    keep = consent == "yes"
    c = Complaint(batch_id=b.id, unit_serial=unitSerial[:40] or None, category=category, description=description, photos_json=paths,
                  contact_name=contactName[:80] or None if keep else None, contact_phone=contactPhone[:20] or None if keep else None,
                  contact_email=contactEmail[:120] or None if keep else None)
    db.add(c)
    db.commit()
    return {"id": c.id, "message": "Thank you. The producer has been notified and will investigate. A report does not by itself establish the cause."}


@router.get("/complaints")
def complaints(user: User = Depends(require_role("producer", "expert")), db: Session = Depends(get_db)):
    q = select(Complaint, Batch).join(Batch, Batch.id == Complaint.batch_id).order_by(Complaint.id.desc())
    if user.role == "producer":
        q = q.where(Batch.producer_id == user.id)
    out = []
    for c, b in db.execute(q).all():
        d = row(c, batch_code=b.batch_code, commodity_name=b.commodity_name, material_lot_id=b.material_lot_id, photos=c.photos_json or [])
        if user.role != "producer":
            for k in ("contact_name", "contact_phone", "contact_email"):
                d.pop(k, None)
        out.append(d)
    return out


class ComplaintPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(new|investigating|resolved|not-packaging-related)$")
    notes: str | None = Field(default=None, max_length=2000)
    reviewed: bool | None = None


@router.patch("/complaints/{cid}")
def patch_complaint(cid: int, body: ComplaintPatch, user: User = Depends(require_role("producer", "expert")), db: Session = Depends(get_db)):
    c = db.get(Complaint, cid)
    b = db.get(Batch, c.batch_id) if c else None
    if not c or (user.role == "producer" and b.producer_id != user.id):
        raise HTTPException(404, "Not found")
    if body.status is not None:
        c.status = body.status
    if body.notes is not None:
        c.manufacturer_notes = body.notes
    if body.reviewed is not None:
        c.reviewed = body.reviewed
    db.commit()
    return {"ok": True}


@router.get("/complaints/clusters")
def clusters(user: User = Depends(require_role("producer", "expert")), db: Session = Depends(get_db)):
    """Clusters suggest investigation; they do not prove packaging caused the problem."""
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    q = select(Complaint, Batch).join(Batch, Batch.id == Complaint.batch_id).where(Complaint.created_at > since)
    if user.role == "producer":
        q = q.where(Batch.producer_id == user.id)
    by_batch: dict = {}
    by_lot: dict = {}
    for c, b in db.execute(q).all():
        k = (b.id, c.category)
        by_batch.setdefault(k, {"batch_id": b.id, "batch_code": b.batch_code, "category": c.category, "n": 0})["n"] += 1
        if b.material_lot_id:
            lot = db.get(MaterialLot, b.material_lot_id)
            k2 = (lot.id, c.category)
            e = by_lot.setdefault(k2, {"lot_id": lot.id, "lot_code": lot.lot_code, "supplier_product_id": lot.supplier_product_id, "category": c.category, "n": 0, "_b": set()})
            e["n"] += 1
            e["_b"].add(b.id)
    lots = []
    for e in by_lot.values():
        if e["n"] >= 2:
            p = _product(e["supplier_product_id"])
            lots.append({**{k: v for k, v in e.items() if k != "_b"}, "batches": len(e["_b"]), "structure": ref.get_structure(p["structureId"])["name"] if p else "?"})
    return {"byBatch": sorted([v for v in by_batch.values() if v["n"] >= 2], key=lambda x: -x["n"]), "byLot": sorted(lots, key=lambda x: -x["n"]),
            "note": "A cluster of reports suggests an investigation. It does not prove that packaging caused the problem; review reports before using them to improve models."}


@router.get("/investigate/lot/{lid}")
def investigate(lid: int, user: User = Depends(require_role("producer", "expert")), db: Session = Depends(get_db)):
    lot = db.get(MaterialLot, lid)
    if not lot or (user.role == "producer" and lot.user_id != user.id):
        raise HTTPException(404, "Lot not found")
    bs = db.execute(select(Batch).where(Batch.material_lot_id == lot.id)).scalars().all()
    ids = [b.id for b in bs] or [-1]
    ships = [{"code": s.code, "destination": s.destination, "status": s.status, "batch_id": sb.batch_id, "units": sb.units}
             for sb, s in db.execute(select(ShipmentBatch, Shipment).join(Shipment, Shipment.id == ShipmentBatch.shipment_id).where(ShipmentBatch.batch_id.in_(ids))).all()]
    sales = [{"batch_code": bc, "store": st, "units": u} for bc, st, u in db.execute(
        select(RetailSale.batch_code, RetailSale.store, func.sum(RetailSale.quantity)).where(RetailSale.batch_id.in_(ids)).group_by(RetailSale.batch_code, RetailSale.store)).all()]
    comps = [{"category": cat, "n": n} for cat, n in db.execute(select(Complaint.category, func.count()).where(Complaint.batch_id.in_(ids)).group_by(Complaint.category)).all()]
    p = _product(lot.supplier_product_id)
    return {"lot": row(lot, checks=lot.receiving_check_json, structure=ref.get_structure(p["structureId"])["name"], supplier=ref.get_supplier(p["supplierId"])["name"]),
            "batches": [{"id": b.id, "batch_code": b.batch_code, "commodity_name": b.commodity_name, "units": b.units, "packed_at": b.packed_at, "parent_batch_id": b.parent_batch_id} for b in bs],
            "shipments": ships, "sales": sales, "complaints": comps}
