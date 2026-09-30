"""Reassessment before dispatch and record compaction."""
from __future__ import annotations

RANK = {"supported": 2, "conditional": 1, "not-supported": 0}


def _summary(c: dict) -> str:
    if c.get("moisture"):
        m = c["moisture"]
        return f'moisture limit after ≈{round(m["daysP10"])}–{round(m["daysP50"])} d (target {round(m["targetDays"])} d)'
    if c.get("map"):
        return f'O₂ {c["map"]["equilibriumAtStorage"]["o2"] * 100:.1f}%, in-window {round(c["map"]["probability"]["inWindow"] * 100)}%'
    if c.get("fresh"):
        return f'{round(c["fresh"]["consumedFraction"] * 100)}% of storage life used'
    return c["support"]


def compare_selected(before: dict, after: dict, plan_id: str | None) -> list[dict]:
    plan = next((p for p in before["plans"] if p["id"] == plan_id), before["plans"][0] if before["plans"] else None)
    if not plan:
        return []
    out = []
    for sel in plan["selections"]:
        pb = next((p for p in before["portions"] if p["portion"]["id"] == sel["portionId"]), None)
        cb = next((c for c in (pb or {}).get("candidates", []) if c["key"] == sel["candidateKey"]), None)
        pa = next((p for p in after["portions"] if p["portion"]["id"] == sel["portionId"]), None)
        ca = next((c for c in (pa or {}).get("candidates", []) if c["key"] == sel["candidateKey"]), None)
        verdict = "unchanged"
        if cb and not ca:
            verdict = "no-longer-supported"
        elif cb and ca:
            d = RANK[ca["support"]] - RANK[cb["support"]]
            if d < 0:
                verdict = "no-longer-supported" if ca["support"] == "not-supported" else "now-conditional"
            elif d > 0:
                verdict = "improved"
            elif ca["support"] == "supported":
                verdict = "still-supported"
        out.append({
            "portionId": sel["portionId"], "label": pb["portion"]["label"] if pb else sel["portionId"],
            "before": {"support": cb["support"], "margin": cb["margin"], "summary": _summary(cb)} if cb else None,
            "after": {"support": ca["support"], "margin": ca["margin"], "summary": _summary(ca)} if ca else None,
            "verdict": verdict,
        })
    return out


def compact(rec: dict) -> dict:
    """Drop bulky traces from options that are not supported to keep stored records small."""
    for p in rec["portions"]:
        for c in p["candidates"]:
            if c["support"] == "not-supported":
                if c.get("moisture"):
                    c["moisture"]["trace"] = []
                if c.get("map"):
                    c["map"]["transient"] = []
                c["explanation"] = ""
    return rec
