"""Demo data for the prototype. Suppliers, prices, transport and billing data are SIMULATED.

Demo account passwords come from PACKWISE_DEMO_PASSWORD (see .env.example); local demonstration only.
Run `python -m app.seed --reset` from the backend folder to reset.
"""
from __future__ import annotations

import math
import secrets
import sys

from sqlalchemy import func, select, text

from .auth import hash_password
from .config import DEMO_PASSWORD
from .db import (Assessment, Base, Batch, Complaint, Event, MaterialLot, RetailSale, SessionLocal, Shipment, ShipmentBatch, Trial, User, engine, init_db)
from .engine.journey import offline_journey
from .engine.reassess import compact
from .engine.recommend import recommend
from .engine.validation import lock_hash

DEMO_USERS = [
    ("producer@demo.packwise", "Demo Producer (Panruti)", "producer", "Panruti Cashew Growers — demo"),
    ("transporter@demo.packwise", "Demo Transporter", "transporter", "Demo Goods Carriers"),
    ("retailer@demo.packwise", "Demo Retailer (Chennai)", "retailer", "Demo Dry Fruits Store, Chennai"),
    ("expert@demo.packwise", "Demo Packaging Reviewer", "expert", "Reviewer panel — demo"),
    ("admin@demo.packwise", "Demo Admin", "admin", "PackWise"),
]


def seed_if_empty(force: bool = False) -> None:
    init_db()
    with SessionLocal() as db:
        if not force and (db.execute(select(func.count(User.id))).scalar() or 0) > 0:
            return
        ids: dict[str, int] = {}
        for email, name, role, org in DEMO_USERS:
            h, salt = hash_password(DEMO_PASSWORD)
            u = User(email=email, name=name, role=role, org=org, password_hash=h, salt=salt)
            db.add(u)
            db.flush()
            ids[role] = u.id
        journey = offline_journey({"name": "Panruti, Cuddalore, Tamil Nadu", "lat": 11.776, "lon": 79.552, "state": "Tamil Nadu"},
                                  {"name": "Chennai, Tamil Nadu", "lat": 13.083, "lon": 80.27, "state": "Tamil Nadu"}, "2026-10-05")
        inp = {"commodityId": "cashew-kernel", "state": "unroasted", "identification": {"method": "user-select", "confirmed": True},
               "portions": [
                   {"id": "p1", "label": "Bulk — immediate use", "kg": 50, "use": "bulk", "storageDays": 2, "storage": {"type": "ambient-room", "status": "assumed"}},
                   {"id": "p2", "label": "Retail — up to 2 weeks", "kg": 20, "use": "retail", "storageDays": 14, "storage": {"type": "ambient-room", "status": "assumed"}},
                   {"id": "p3", "label": "Retail — 5 months", "kg": 30, "use": "retail", "storageDays": 150, "storage": {"type": "ambient-room", "status": "assumed"}}],
               "properties": {}, "equipment": ["heat-impulse"], "journey": journey, "userState": "Tamil Nadu"}
        result = compact(recommend(inp))
        plan = next((p for p in result["plans"] if "delay-tolerant" in p["tags"]), result["plans"][0])
        a = Assessment(user_id=ids["producer"], title="Cashew kernels — Panruti to Chennai (worked example)", commodity_id="cashew-kernel",
                       input_json=inp, result_json=result, engine_version=result["engineVersion"], selected_plan_id=plan["id"])
        db.add(a)
        db.flush()
        sel = next(s for s in plan["selections"] if s["portionId"] == "p3")
        cand = next(c for p in result["portions"] if p["portion"]["id"] == "p3" for c in p["candidates"] if c["key"] == sel["candidateKey"])
        lot = MaterialLot(user_id=ids["producer"], supplier_product_id=cand["supplierProductId"], lot_code="DEMO-LOT-2609", received_at="2026-09-26", units_received=cand["units"] + 20,
                          receiving_check_json={"technicalMatch": True, "dimensionsOk": True, "lotMatchesOrder": True, "sampleSealOk": True, "documentsReceived": True, "notes": "Seeded demo lot"},
                          accepted=True)
        db.add(lot)
        db.flush()
        code = "PW260928-CAS-0001"
        b = Batch(public_token=secrets.token_urlsafe(8), batch_code=code, producer_id=ids["producer"], assessment_id=a.id, candidate_key=cand["key"],
                  recommendation_version=f'{result["engineVersion"]} / assessment #{a.id}', commodity_id="cashew-kernel", commodity_name="Cashew kernels", state="unroasted",
                  origin="Panruti, Tamil Nadu", harvest_date="2026-04-20", packed_at="2026-09-28T09:00:00Z", quantity_kg=cand["units"] * cand["packSizeKg"], units=cand["units"],
                  pack_size_kg=cand["packSizeKg"], structure_id=cand["structureId"], structure_name=cand["structureName"], oxygen_control=cand["oxygenControl"],
                  material_lot_id=lot.id, supplier_product_id=cand["supplierProductId"],
                  packing_checks_json={"fillWeightChecked": True, "sealVisual": True, "squeezeTest": True, "sampleSize": (cand.get("seal") or {}).get("sampling", {}).get("sampleSize", 10), "failures": 0},
                  handling_json={"storage": "Cool, dry, dark place; keep away from strong odours.", "disposal": cand["sustainability"]["recyclability"]["label"],
                                 "pwmCategory": cand["sustainability"]["recyclability"]["pwmCategory"], "packaging": cand["structureName"], "oxygenControl": cand["oxygenControl"]})
        db.add(b)
        db.flush()
        db.add(Event(type="packed", batch_id=b.id, actor_id=ids["producer"], actor_role="producer", event_time="2026-09-28T09:00:00Z", location="Panruti", units=cand["units"]))
        s = Shipment(code="SH-DEMO-01", created_by=ids["producer"], origin="Panruti", destination="Chennai", transporter_id=ids["transporter"], receiver_id=ids["retailer"],
                     declared_conditions_json={"vehicle": "Enclosed goods vehicle (shared load)", "notes": "Keep dry; do not stack more than 6 cartons"}, status="received")
        db.add(s)
        db.flush()
        db.add(ShipmentBatch(shipment_id=s.id, batch_id=b.id, units=cand["units"]))
        db.add(Event(type="dispatch", shipment_id=s.id, actor_id=ids["transporter"], actor_role="transporter", event_time="2026-09-29T05:30:00Z", location="Panruti", units=cand["units"]))
        db.add(Event(type="handoff", shipment_id=s.id, actor_id=ids["transporter"], actor_role="transporter", event_time="2026-09-29T14:00:00Z", location="Transport hub, Chennai"))
        db.add(Event(type="receipt", shipment_id=s.id, actor_id=ids["retailer"], actor_role="retailer", event_time="2026-09-30T04:30:00Z", location="Demo Dry Fruits Store, Chennai",
                     units=cand["units"], condition_json={"damagedUnits": 0, "remarks": "Cartons dry and intact"}))
        for i in range(1, 4):
            t = f"2026-09-30T0{5 + i}:10:00Z"
            db.add(RetailSale(retailer_id=ids["retailer"], batch_id=b.id, batch_code=code, unit_serial=f"{code}-U000{i}", quantity=1, store="Demo Dry Fruits Store, Chennai", source="pos-simulator", sold_at=t))
            db.add(Event(type="retail-sale", batch_id=b.id, actor_id=ids["retailer"], actor_role="retailer", event_time=t, location="Chennai", units=1, notes=f"Unit {code}-U000{i}"))
        db.add(Complaint(batch_id=b.id, unit_serial=f"{code}-U0002", category="leaking-seal", description="Pouch side seal opened when I pressed it.", photos_json=[]))
        db.add(Complaint(batch_id=b.id, category="leaking-seal", description="Zip area seal had a small gap.", photos_json=[]))
        # Pre-registered trial with recorded results (illustrative demo numbers)
        trace = (cand.get("moisture") or {}).get("trace") or []
        preds = []
        for day in (30, 60):
            if trace:
                pt = min(trace, key=lambda x: abs(x["day"] - day))
                preds.append({"metric": "moisture", "day": day, "predicted": round(pt["moistureWb"], 2)})
        design = {
            "commodityId": "cashew-kernel", "control": "Current LDPE 50 µm pouch, air-packed",
            "treatment": cand["plainName"] + (f' + {cand["oxygenControl"]}' if cand["oxygenControl"] != "none" else ""),
            "conditions": "ordinary room, Chennai (logged 27–33 °C, 62–84% RH)", "durationDays": 60, "checkpointsDays": [0, 30, 60], "unitsPerArm": 50, "primaryMetric": "saleable",
            "metrics": [
                {"key": "moisture", "label": "Kernel moisture", "unit": "% w.b.", "type": "continuous", "direction": "treatment-lower", "minimumDifference": 0.3},
                {"key": "saleable", "label": "Saleable packs (no rancid smell, crisp)", "unit": "pp", "type": "proportion", "direction": "treatment-higher", "minimumDifference": 5},
                {"key": "pv", "label": "Peroxide value", "unit": "meq O₂/kg", "type": "continuous", "direction": "treatment-lower", "minimumDifference": 1}],
            "predictions": preds, "assessmentId": a.id, "candidateKey": cand["key"], "expertReviewer": "Demo Packaging Reviewer",
            "controlStructureId": "ldpe-50", "treatmentStructureId": cand["structureId"], "treatmentOxygenControl": cand["oxygenControl"], "storageTC": 30, "storageRh": 75,
        }

        def r(seed: int) -> float:
            x = math.sin(seed * 999) * 10000
            return x - math.floor(x)

        obs = []
        p60 = preds[1]["predicted"] if len(preds) > 1 else 4.2
        p30 = preds[0]["predicted"] if preds else 4.1
        for i in range(6):
            obs += [{"arm": "control", "metric": "moisture", "day": 60, "value": round(5.15 + (r(i) - 0.5) * 0.4, 2), "sampleId": f"C{i + 1}"},
                    {"arm": "treatment", "metric": "moisture", "day": 60, "value": round(p60 + 0.18 + (r(i + 10) - 0.5) * 0.3, 2), "sampleId": f"T{i + 1}"},
                    {"arm": "control", "metric": "pv", "day": 60, "value": round(4.1 + (r(i + 20) - 0.5) * 1.2, 2), "sampleId": f"C{i + 1}"},
                    {"arm": "treatment", "metric": "pv", "day": 60, "value": round(1.6 + (r(i + 30) - 0.5) * 0.8, 2), "sampleId": f"T{i + 1}"},
                    {"arm": "control", "metric": "moisture", "day": 30, "value": round(4.7 + (r(i + 40) - 0.5) * 0.3, 2)},
                    {"arm": "treatment", "metric": "moisture", "day": 30, "value": round(p30 + 0.1 + (r(i + 50) - 0.5) * 0.3, 2)}]
        obs += [{"arm": "control", "metric": "saleable", "day": 60, "value": 38, "n": 50}, {"arm": "treatment", "metric": "saleable", "day": 60, "value": 48, "n": 50}]
        db.add(Trial(user_id=ids["producer"], assessment_id=a.id, title="Cashew retail pouch — 60-day comparison (demo data)", design_json=design,
                     locked_at="2026-07-28T10:00:00Z", lock_hash=lock_hash(design), observations_json=[{**o, "recordedAt": "2026-09-27T10:00:00Z"} for o in obs], status="completed"))
        db.commit()
        print(f"Seeded demo data ({len(DEMO_USERS)} users). Demo password from PACKWISE_DEMO_PASSWORD.")


def reset() -> None:
    Base.metadata.drop_all(engine)
    seed_if_empty(force=True)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
    else:
        seed_if_empty()
