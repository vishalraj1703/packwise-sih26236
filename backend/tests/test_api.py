"""End-to-end API tests (FastAPI TestClient): assessment → batch QR → shipment → POS → complaint → trial."""
import io

import pytest
from fastapi.testclient import TestClient

from app.engine.journey import offline_journey
from app.main import app

PW = "packwise-demo"
JOURNEY = offline_journey({"name": "Panruti", "lat": 11.776, "lon": 79.552, "state": "Tamil Nadu"}, {"name": "Chennai", "lat": 13.083, "lon": 80.27, "state": "Tamil Nadu"}, "2026-10-05")
INPUT = {"commodityId": "cashew-kernel", "state": "unroasted", "identification": {"method": "user-select", "confirmed": True},
         "portions": [{"id": "p1", "label": "Retail 2 weeks", "kg": 20, "use": "retail", "storageDays": 14, "storage": {"type": "ambient-room", "status": "assumed"}}],
         "properties": {"initialMoistureWb": {"value": 4.2, "lo": 3.9, "hi": 4.5, "unit": "% w.b.", "status": "measured"}}, "equipment": ["heat-impulse"], "journey": JOURNEY, "userState": "Tamil Nadu"}


def client(role: str | None = None) -> TestClient:
    c = TestClient(app)
    c.__enter__()  # runs startup (seeding)
    if role:
        r = c.post("/api/auth/login", json={"email": f"{role}@demo.packwise", "password": PW})
        assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def producer():
    return client("producer")


def test_status_and_reference():
    c = client()
    s = c.get("/api/status").json()
    assert s["engine"].startswith("packwise-engine 2") and s["database"] == "sqlite"
    b = c.get("/api/reference/bundle").json()
    assert any(x["id"] == "instant-noodles" and x["image"] for x in b["commodities"])
    assert c.get("/images/cashew-kernel.jpg").status_code == 200


def test_validation_errors_are_readable():
    c = client()
    bad = {**INPUT, "properties": {"initialMoistureWb": {"value": 42, "unit": "% w.b.", "status": "measured"}}, "state": "fried"}
    r = c.post("/api/assessments/compute", json=bad)
    assert r.status_code == 400
    assert "Invalid input" in r.json()["error"]


def test_bearer_token_login_for_mobile():
    c = TestClient(app)
    tok = c.post("/api/auth/login", json={"email": "producer@demo.packwise", "password": PW}).json()["token"]
    c.cookies.clear()
    assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()["user"]["role"] == "producer"
    assert c.post("/api/auth/login", json={"email": "producer@demo.packwise", "password": "wrong"}).status_code == 401


def test_full_traceability_flow(producer):
    r = producer.post("/api/assessments", json={"input": INPUT})
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    res = producer.get(f"/api/assessments/{aid}").json()
    plan = res["result"]["plans"][0]
    assert producer.post(f"/api/assessments/{aid}/select", json={"planId": plan["id"]}).json()["ok"]
    re = producer.post(f"/api/assessments/{aid}/reassess", json={"input": {"journey": {**JOURNEY, "driveHours": JOURNEY["driveHours"] + 48}}, "note": "+48 h"}).json()
    assert re["comparison"][0]["verdict"] in ("still-supported", "now-conditional", "no-longer-supported", "unchanged", "improved")

    cand = next(c for p in res["result"]["portions"] for c in p["candidates"] if c["key"] == plan["selections"][0]["candidateKey"])
    q = producer.post("/api/quotes", json={"assessmentId": aid, "supplierId": "sup-flex-chennai", "supplierProductId": cand["supplierProductId"], "kind": "quotation", "units": cand["units"], "sizeKg": cand["packSizeKg"]})
    lot = producer.post("/api/material-lots", json={"supplierProductId": cand["supplierProductId"], "lotCode": "T-LOT-1", "receivedAt": "2026-10-01", "unitsReceived": 200,
                                                    "checks": {"technicalMatch": True, "dimensionsOk": True, "lotMatchesOrder": True, "sampleSealOk": True, "documentsReceived": False}}).json()
    assert lot["accepted"]
    b = producer.post("/api/batches", json={"assessmentId": aid, "candidateKey": cand["key"], "materialLotId": lot["id"], "commodityId": "cashew-kernel", "state": "unroasted",
                                            "origin": "Panruti", "packedAt": "2026-10-01T09:00:00Z", "quantityKg": 20, "units": cand["units"], "packSizeKg": cand["packSizeKg"],
                                            "structureId": cand["structureId"], "oxygenControl": cand["oxygenControl"], "packingChecks": {"leakTested": True}}).json()
    assert b["publicUrl"].endswith(b["publicToken"])
    svg = producer.get(f'/api/qr/{b["publicToken"]}.svg')
    assert svg.status_code == 200 and b"<svg" in svg.content

    transporter, retailer = client("transporter"), client("retailer")
    users = {u["role"]: u["id"] for u in producer.get("/api/users").json()}
    sh = producer.post("/api/shipments", json={"origin": "Panruti", "destination": "Chennai", "transporterId": users["transporter"], "receiverId": users["retailer"],
                                               "declaredConditions": {"vehicle": "Enclosed"}, "batches": [{"batchId": b["id"], "units": cand["units"]}]}).json()
    assert retailer.post(f'/api/shipments/{sh["id"]}/events', json={"type": "dispatch"}).status_code == 403
    assert retailer.post(f'/api/shipments/{sh["id"]}/events', json={"type": "receipt", "units": 1}).status_code == 400
    assert transporter.post(f'/api/shipments/{sh["id"]}/events', json={"type": "dispatch", "units": cand["units"]}).json()["ok"]
    rec = retailer.post(f'/api/shipments/{sh["id"]}/events', json={"type": "receipt", "units": cand["units"] - 1}).json()
    assert rec["warnings"]  # discrepancy flagged

    sale = retailer.post("/api/pos/sale", json={"code": f'{b["batchCode"]}-U0001'}).json()
    assert sale["ok"] and not sale["warnings"]
    assert retailer.post("/api/pos/sale", json={"code": f'{b["batchCode"]}-U0001'}).json()["warnings"]
    assert retailer.post("/api/pos/sale", json={"code": f'{b["batchCode"]}-U9999'}).status_code == 400
    key = retailer.post("/api/pos/api-key").json()["apiKey"]
    anon = TestClient(app)
    assert anon.post("/api/pos/sale", json={"code": f'{b["batchCode"]}-U0002'}, headers={"X-API-Key": key}).json()["ok"]

    pub = anon.get(f'/api/public/batch/{b["publicToken"]}').json()
    assert pub["commodity"] == "Cashew kernels" and pub["image"]
    for i in range(2):
        r = anon.post(f'/api/public/batch/{b["publicToken"]}/complaint', data={"category": "leaking-seal", "description": f"Seal opened {i}", "consent": "yes", "contactName": "A"},
                      files=[("photos", ("p.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png"))])
        assert r.status_code == 200, r.text
    assert transporter.get("/api/complaints").status_code == 403
    cl = producer.get("/api/complaints/clusters").json()
    assert any(x["lot_code"] == "T-LOT-1" for x in cl["byLot"])
    inv = producer.get(f'/api/investigate/lot/{lot["id"]}').json()
    assert inv["batches"][0]["id"] == b["id"]
    detail = producer.get(f'/api/batches/{b["id"]}').json()
    assert len(detail["sales"]) == 2 and detail["complaints"][0]["photos_json"]
    photo = detail["complaints"][0]
    import json
    assert producer.get(json.loads(photo["photos_json"])[0]).status_code == 200


def test_trial_lock_and_analysis(producer):
    design = {"commodityId": "cashew-kernel", "control": "LDPE", "treatment": "Met pouch", "conditions": "room", "durationDays": 30, "checkpointsDays": [0, 30], "unitsPerArm": 20,
              "primaryMetric": "m", "metrics": [{"key": "m", "label": "Moisture", "unit": "%", "type": "continuous", "direction": "treatment-lower", "minimumDifference": 0.2}]}
    tid = producer.post("/api/trials", json={"title": "Test trial", "design": design}).json()["id"]
    assert producer.post(f"/api/trials/{tid}/observations", json={"observations": [{"arm": "control", "metric": "m", "day": 30, "value": 5}]}).status_code == 409
    producer.post(f"/api/trials/{tid}/lock")
    assert producer.put(f"/api/trials/{tid}", json={"title": "changed", "design": design}).status_code == 409
    obs = [{"arm": "control", "metric": "m", "day": 30, "value": v} for v in (5.1, 5.2, 5.0, 5.3)] + [{"arm": "treatment", "metric": "m", "day": 30, "value": v} for v in (4.2, 4.3, 4.1, 4.4)]
    producer.post(f"/api/trials/{tid}/observations", json={"observations": obs})
    t = producer.get(f"/api/trials/{tid}").json()
    assert t["integrity"] is True
    assert t["analysis"]["metrics"][0]["decision"] == "meets-threshold"


def test_ml_is_gated_until_enough_data(producer):
    s = producer.get("/api/ml/status").json()
    assert s["enabled"] is False and s["readyToTrain"] is False
    expert = client("expert")
    assert expert.post("/api/ml/train").json()["trained"] is False


def test_verified_example_requires_expert():
    anon = TestClient(app)
    assert anon.post("/api/examples", data={"structureId": "ldpe-50"}).status_code in (400, 401)
    expert = client("expert")
    r = expert.post("/api/examples", data={"structureId": "bopp-metbopp", "product": "test noodles", "brand": "TEST", "photoSource": "test image", "documentedStructure": "test only",
                                           "structureSource": "test", "sourceDate": "2026-10-01"},
                    files={"photo": ("x.png", io.BytesIO(b"\x89PNG\r\n\x1a\n0000"), "image/png")})
    assert r.status_code == 200, r.text
    assert any(e["brand"] == "TEST" for e in anon.get("/api/examples").json())
    assert expert.delete(f'/api/examples/{r.json()["id"]}').json()["ok"]
