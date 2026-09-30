"""Cross-language parity: the Python engine (server) and the TypeScript engine (web offline
fallback) must give the same recommendations for the same inputs."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.engine.recommend import recommend

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "backend" / "tests" / "ts_engine.ts"

CASES = {
    "cashew-3-portions": {"commodityId": "cashew-kernel", "state": "unroasted", "portions": [
        {"id": "p1", "label": "Bulk", "kg": 50, "use": "bulk", "storageDays": 2, "storage": {"type": "ambient-room", "status": "assumed"}},
        {"id": "p2", "label": "2 weeks", "kg": 20, "use": "retail", "storageDays": 14, "storage": {"type": "ambient-room", "status": "assumed"}},
        {"id": "p3", "label": "5 months", "kg": 30, "use": "retail", "storageDays": 150, "storage": {"type": "ambient-room", "status": "assumed"}}]},
    "tomato-cool-room": {"commodityId": "tomato", "state": "fresh-whole", "portions": [
        {"id": "p1", "label": "Retail", "kg": 100, "use": "retail", "storageDays": 5, "storage": {"type": "cool-room", "status": "assumed"}}]},
    "noodles-60-days": {"commodityId": "instant-noodles", "state": "fried", "portions": [
        {"id": "p1", "label": "Retail", "kg": 50, "use": "retail", "storageDays": 60, "storage": {"type": "retail-shelf", "status": "assumed"}}]},
}


def _inputs():
    journey = {"origin": {"name": "Panruti", "lat": 11.776, "lon": 79.552, "state": "Tamil Nadu"}, "destination": {"name": "Chennai", "lat": 13.083, "lon": 80.27, "state": "Tamil Nadu"},
               "distanceKm": 214, "driveHours": 5.4, "routeSource": "user", "departureDate": "2026-10-05",
               "transitWeather": [{"date": "2026-10-05", "tMax": 34, "tMin": 26, "rhMean": 75, "precipProb": None, "source": "assumed"}],
               "destinationClimate": {"tMean": 30, "rhMean": 75, "source": "assumed", "note": ""}, "retrievedAt": "", "warnings": []}
    return {k: {**v, "identification": {"method": "user-select", "confirmed": True}, "properties": {}, "equipment": ["heat-impulse"], "journey": journey, "userState": "Tamil Nadu"}
            for k, v in CASES.items()}


@pytest.fixture(scope="module")
def ts_results(tmp_path_factory):
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx or not (ROOT / "node_modules").exists():
        pytest.skip("Node toolchain not installed — parity test needs the web dependencies")
    d = tmp_path_factory.mktemp("parity")
    inp = d / "inputs.json"
    out = d / "outputs.json"
    inp.write_text(json.dumps(_inputs()), encoding="utf-8")
    subprocess.run([npx, "tsx", str(SCRIPT), str(inp), str(out)], cwd=ROOT, check=True, timeout=300, shell=False)
    return json.loads(out.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", list(CASES))
def test_engines_agree(case, ts_results):
    py = recommend(_inputs()[case])
    ts = ts_results[case]
    py_c = {c["key"]: c for p in py["portions"] for c in p["candidates"]}
    ts_c = {c["key"]: c for p in ts["portions"] for c in p["candidates"]}
    assert py_c.keys() == ts_c.keys()
    for k, t in ts_c.items():
        p = py_c[k]
        assert p["support"] == t["support"], k
        assert p["standaloneInr"] == pytest.approx(t["standaloneInr"], rel=1e-6), k
        if t.get("moisture"):
            for f in ("daysP10", "daysP50", "requiredWvtrP50"):
                if t["moisture"][f] < 1e5:
                    assert p["moisture"][f] == pytest.approx(t["moisture"][f], rel=0.01), (k, f)
        if t.get("map"):
            assert p["map"]["holes"] == t["map"]["holes"], k
            assert p["map"]["equilibriumAtStorage"]["o2"] == pytest.approx(t["map"]["equilibriumAtStorage"]["o2"], abs=0.002), k
            assert p["map"]["probability"]["inWindow"] == pytest.approx(t["map"]["probability"]["inWindow"], abs=0.02), k
    assert [(tuple(p["tags"]), round(p["cost"]["totalInr"], 1)) for p in py["plans"]] == [(tuple(p["tags"]), round(p["cost"]["totalInr"], 1)) for p in ts["plans"]]
