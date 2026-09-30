"""Scientific engine tests — physics, the five technical gaps and the recommendation sequence."""
import math

import pytest

from app import reference as ref
from app.engine.barrier import minimum_gauge, recyclability, structure_at_test
from app.engine.journey import offline_journey
from app.engine.map import equilibrium, hole_conductance, respiration_o2
from app.engine.moisture import moisture_trajectory, required_wvtr
from app.engine.oxygen import headspace_o2_mg, required_otr, size_absorber
from app.engine.physics import arrhenius, psat
from app.engine.recommend import recommend
from app.engine.retrieval import search
from app.engine.sealing import ista_drop_height_cm, mckee_bct, zero_acceptance_sample
from app.engine.validation import decide, lock_hash, sample_size_means, two_proportions, welch
from app.schemas import AssessmentInput

PROFILE = [{"label": "store", "days": 100, "tC": 30, "rhPct": 75, "status": "assumed"}]
MOIST = {"initialWb": 4, "criticalWb": 5, "isoA": 0.005, "isoB": 0.085, "isoRange": [0.2, 0.75], "fillKg": 0.5, "areaM2": 0.06}


def test_psat_matches_steam_tables():
    assert 3150 < psat(25) < 3180
    assert 6600 < psat(38) < 6650
    assert arrhenius(40, 23, 33) > 1.5


def test_laminate_series_resistance():
    foil = structure_at_test(ref.get_structure("pet-al-pe"))
    pe = structure_at_test(ref.get_structure("ldpe-50"))
    assert foil["otr"] < 0.1
    assert pe["otr"] > 3000
    assert pe["wvtr"] == pytest.approx(9, abs=0.5)


def test_minimum_gauge():
    g = minimum_gauge("LDPE", None, 9)
    assert g["exactUm"] == pytest.approx(50, abs=0.5)
    assert g["gaugeUm"] == 50


def test_recyclability_categories():
    assert "Category II" in recyclability(ref.get_structure("ldpe-50"))["pwmCategory"]
    assert "Category III" in recyclability(ref.get_structure("pet-al-pe"))["pwmCategory"]


def test_moisture_better_barrier_lasts_longer():
    poor = moisture_trajectory(MOIST, PROFILE, lambda t, rh: 1e-4 * 0.06)
    good = moisture_trajectory(MOIST, PROFILE, lambda t, rh: 1e-6 * 0.06)
    assert poor["criticalDayExtended"] < good["criticalDayExtended"]


def test_required_wvtr_exactly_meets_target():
    r = required_wvtr(MOIST, PROFILE)
    assert 0 < r["wvtrTest"] < 1e6
    from app.engine.barrier import DP_WVTR_TEST, GENERIC_E_H2O
    k = lambda w: lambda t, rh=None: (w / DP_WVTR_TEST) * arrhenius(GENERIC_E_H2O, 38, t) * MOIST["areaM2"]  # noqa: E731
    assert moisture_trajectory(MOIST, PROFILE, k(r["wvtrTest"] * 0.98))["criticalDay"] is None
    assert moisture_trajectory(MOIST, PROFILE, k(r["wvtrTest"] * 1.05))["criticalDay"] is not None


def test_food_above_limit_flagged():
    assert moisture_trajectory({**MOIST, "initialWb": 5.2}, PROFILE, lambda t, rh: 1e-6)["criticalDay"] == 0


def test_required_otr_scales_with_duration():
    a = required_otr(10, 0.5, 0.06, [{**PROFILE[0], "days": 50}])
    b = required_otr(10, 0.5, 0.06, [{**PROFILE[0], "days": 100}])
    assert a / b == pytest.approx(2, rel=1e-6)
    assert headspace_o2_mg(1, 0.209) > 260
    s = size_absorber(0.3, 50)
    assert s["sachetCc"] >= s["neededCc"]


def test_map_hole_conductance_and_equilibrium():
    k = hole_conductance(100, 35, 20, "O2")
    assert 80 < k < 250
    assert hole_conductance(100, 35, 20, "CO2") < k
    p = {"rco2At20": 25, "q10": 2.3, "rq": 1, "km": 0.03}
    assert equilibrium({"gO2": 200, "gCO2": 700}, 1, 25, p)["o2"] < equilibrium({"gO2": 200, "gCO2": 700}, 1, 13, p)["o2"]
    assert respiration_o2(0.209, 30, p) > respiration_o2(0.209, 20, p)


def test_sealing_and_mechanical():
    assert zero_acceptance_sample(1000) == 59
    assert zero_acceptance_sample(20) == 20
    assert 3500 < mckee_bct(7800, 6.5, 1.4) < 6000
    assert ista_drop_height_cm(5) == 76 and ista_drop_height_cm(50) == 20


def test_statistics():
    w = welch([5.1, 5.2, 5.3, 5.0, 5.2], [4.1, 4.2, 4.0, 4.3, 4.1])
    assert w["p"] < 0.001
    assert decide(w["ci"], {"direction": "treatment-lower", "minimumDifference": 0.3}) == "meets-threshold"
    t = two_proportions(38, 50, 48, 50)
    assert t["ci"][0] < t["diff"] < t["ci"][1]
    assert lock_hash({"a": 1}) == lock_hash({"a": 1}) != lock_hash({"a": 2})
    assert sample_size_means(0.3, 0.3) == 16


JOURNEY = offline_journey({"name": "Panruti", "lat": 11.776, "lon": 79.552, "state": "Tamil Nadu"}, {"name": "Chennai", "lat": 13.083, "lon": 80.27, "state": "Tamil Nadu"}, "2026-10-05")


def run(commodity: str, state: str, days: float, kg: float = 20, storage=None, equipment=("heat-impulse",), measurements=None):
    storage = storage or {"type": "ambient-room", "status": "assumed"}
    inp = AssessmentInput.model_validate({
        "commodityId": commodity, "state": state, "identification": {"method": "user-select", "confirmed": True},
        "portions": [{"id": "p", "label": "x", "kg": kg, "use": "retail", "storageDays": days, "storage": storage}],
        "properties": {"measurements": measurements} if measurements else {}, "equipment": list(equipment), "journey": JOURNEY, "userState": "Tamil Nadu"})
    return recommend(inp.engine_dict())


def test_long_cashew_storage_needs_oxygen_control():
    r = run("cashew-kernel", "unroasted", 150, 30)
    ok = [c for c in r["portions"][0]["candidates"] if c["support"] == "supported"]
    assert ok and all(c["oxygenControl"] != "none" for c in ok)
    assert not any(c["structureId"] == "ldpe-50" for c in ok)
    assert r["plans"]


def test_short_storage_accepts_ldpe():
    r = run("cashew-kernel", "unroasted", 14)
    assert any(c["structureId"] == "ldpe-50" and c["support"] == "supported" for c in r["portions"][0]["candidates"])


def test_never_offers_pack_that_cannot_be_closed():
    r = run("cashew-kernel", "unroasted", 14, 10, equipment=())
    for c in r["portions"][0]["candidates"]:
        if c["support"] != "not-supported":
            assert c["viaService"] or c["sealMethod"]


def test_insufficient_evidence_for_pickle_without_ph():
    r = run("mango-pickle", "processed", 30, 10)
    assert r["portions"][0]["insufficient"]
    assert r["plans"] == []


def test_hot_transit_map_risk_for_tomato():
    r = run("tomato", "fresh-whole", 5, 50, storage={"type": "cool-room", "status": "assumed"})
    hot = [c for c in r["portions"][0]["candidates"] if c["transportId"] == "dedicated" and c["map"]]
    assert any("anaerobic" in x or "window" in x for c in hot for x in c["reasons"])


def test_fragile_food_never_vacuum_packed():
    r = run("instant-noodles", "fried", 60, 20)
    assert not any(c["oxygenControl"] == "vacuum" and c["structureId"] != "tin-can" for c in r["portions"][0]["candidates"])


def test_plans_prefer_fully_supported():
    r = run("cashew-kernel", "unroasted", 150, 30)
    cands = {c["key"]: c for p in r["portions"] for c in p["candidates"]}
    cheapest = next(p for p in r["plans"] if "lowest-cost" in p["tags"])
    assert all(cands[s["candidateKey"]]["support"] == "supported" for s in cheapest["selections"])


def test_input_validation_rejects_wrong_units():
    with pytest.raises(ValueError):
        AssessmentInput.model_validate({"commodityId": "cashew-kernel", "state": "unroasted", "identification": {"method": "user-select", "confirmed": True},
                                        "portions": [{"id": "p", "label": "x", "kg": 1, "use": "retail", "storageDays": 1, "storage": {"type": "ambient-room", "status": "assumed"}}],
                                        "properties": {"initialMoistureWb": {"value": 400, "unit": "% w.b.", "status": "measured"}}, "journey": JOURNEY})
    with pytest.raises(ValueError):
        AssessmentInput.model_validate({"commodityId": "cashew-kernel", "state": "fried", "identification": {"method": "user-select", "confirmed": True},
                                        "portions": [{"id": "p", "label": "x", "kg": 1, "use": "retail", "storageDays": 1, "storage": {"type": "ambient-room", "status": "assumed"}}], "journey": JOURNEY})


def test_retrieval_finds_perforation_article():
    hits = search("how do I size micro perforations for tomato")
    assert hits[0]["article"]["id"] == "K6"
