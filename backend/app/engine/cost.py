"""Order-level cost (discussion record p.5).

Total = material + setup/minimum-order effects + consumables + labour + equipment or
packing-service charges + outer packaging + delivery + applicable taxes. Each line says
whether it is a (simulated) quotation or an estimate.
"""
from __future__ import annotations

import math

from .. import reference as ref
from .journey import haversine_km

DEFAULT_COST_SETTINGS = {"gstPackagingPct": 18, "gstTransportPct": 5, "labourInrPerHour": 60, "quoteDate": "2026-09-30"}


def _product(pid: str) -> dict:
    return next(p for p in ref.supplier_products() if p["id"] == pid)


def aggregate_order_cost(items: list[dict], transport: dict, origin: dict, settings: dict | None = None) -> dict:
    st = {**DEFAULT_COST_SETTINGS, **(settings or {})}
    lines: list[dict] = []
    # group purchases by supplier product so MOQ and setup apply once per product line
    by_product: dict[str, dict] = {}
    for it in items:
        if not it["supplierProductId"]:
            continue
        g = by_product.setdefault(it["supplierProductId"], {"units": {}, "portions": []})
        g["units"][it["sizeKey"]] = g["units"].get(it["sizeKey"], 0) + it["units"]
        g["portions"].append(it["portionId"])
    used: list[str] = []
    material_total = 0.0
    for pid, g in by_product.items():
        p = _product(pid)
        sup = ref.get_supplier(p["supplierId"])
        if sup["id"] not in used:
            used.append(sup["id"])
        # MOQ top-up units are bought at the cheapest listed size in this order line.
        extra = max(0, p["moqUnits"] - sum(g["units"].values()))
        cheapest = sorted(g["units"], key=lambda k: (p["unitPriceInr"][k], float(k)))[0]
        for size, u in g["units"].items():
            buy = u + (extra if size == cheapest else 0)
            amt = buy * p["unitPriceInr"][size]
            material_total += amt
            label = f'{sup["name"]}: {buy} × {size} kg pack' + (f' (incl. {buy - u} above need, MOQ {p["moqUnits"]})' if buy > u else "")
            lines.append({"group": "material", "label": label, "amountInr": amt, "basis": "simulated-quote",
                          "detail": f'₹{p["unitPriceInr"][size]:.2f}/unit, quoted {st["quoteDate"]}, lead time {p["leadTimeDays"]} days'})
        if p["setupCostInr"] > 0:
            lines.append({"group": "setup", "label": f'{sup["name"]}: printing / setup', "amountInr": p["setupCostInr"], "basis": "simulated-quote", "detail": "One-time per order line"})
    for sid in used:
        s = ref.get_supplier(sid)
        km = haversine_km(s, origin) * 1.3
        lines.append({"group": "delivery", "label": f'Delivery of materials from {s["city"]}', "amountInr": round(150 + max(0, km - 30) * 2.5),
                      "basis": "estimate", "detail": f"≈{round(km)} km courier/transport estimate"})
    cons = sum(i["consumablesInr"] for i in items)
    if cons > 0:
        lines.append({"group": "consumables", "label": "Sealing / flushing consumables", "amountInr": cons, "basis": "estimate",
                      "detail": "; ".join(dict.fromkeys(i["consumablesDetail"] for i in items if i["consumablesDetail"]))})
    minutes = sum(i["labourMinutes"] for i in items)
    lines.append({"group": "labour", "label": f"Packing labour ({round(minutes)} min)", "amountInr": minutes / 60 * st["labourInrPerHour"],
                  "basis": "estimate", "detail": f'₹{st["labourInrPerHour"]}/hour'})
    by_service: dict[str, int] = {}
    for it in items:
        if it["serviceId"]:
            by_service[it["serviceId"]] = by_service.get(it["serviceId"], 0) + it["units"]
    for sid, units in by_service.items():
        sup = ref.get_supplier(sid)
        ps = sup["packingService"]
        lines.append({"group": "service", "label": f'{sup["name"]}: packing service ({units} packs)', "amountInr": max(ps["minChargeInr"], units * ps["pricePerPackInr"]),
                      "basis": "simulated-quote", "detail": f'₹{ps["pricePerPackInr"]}/pack, minimum ₹{ps["minChargeInr"]}'})
    outer = sum(i["outerInr"] for i in items)
    if outer > 0:
        lines.append({"group": "outer", "label": "Outer packaging (cartons / crates)", "amountInr": outer, "basis": "estimate",
                      "detail": "; ".join(dict.fromkeys(i["outerDetail"] for i in items if i["outerDetail"]))})
    lines.append({"group": "transport", "label": transport["label"], "amountInr": transport["costInr"], "basis": "simulated-quote",
                  "detail": f'{round(transport["transitHours"])} h door-to-door (simulated rate card)'})
    taxable = sum(l["amountInr"] for l in lines if l["group"] in ("material", "setup", "consumables", "outer", "delivery", "service"))
    lines.append({"group": "tax", "label": f'GST on packaging & services ({st["gstPackagingPct"]}%)', "amountInr": taxable * st["gstPackagingPct"] / 100,
                  "basis": "estimate", "detail": "Default rate — verify the applicable HSN/SAC rate"})
    lines.append({"group": "tax", "label": f'GST on transport ({st["gstTransportPct"]}%)', "amountInr": transport["costInr"] * st["gstTransportPct"] / 100,
                  "basis": "estimate", "detail": "Default GTA rate — verify"})
    total = sum(l["amountInr"] for l in lines)
    kg = sum(i["kg"] for i in items)
    for l in lines:
        l["amountInr"] = round(l["amountInr"], 2)
    return {"lines": lines, "totalInr": round(total, 2), "perKgInr": round(total / max(kg, 1e-9), 2),
            "packagingOnlyInr": round(total - transport["costInr"] * (1 + st["gstTransportPct"] / 100), 2), "materialInr": round(material_total, 2)}


def standalone_cost(it: dict) -> float:
    """Standalone cost of one portion's packaging, used for ranking before order aggregation."""
    if not it["supplierProductId"]:
        return math.inf
    p = _product(it["supplierProductId"])
    svc = 0.0
    if it["serviceId"]:
        ps = ref.get_supplier(it["serviceId"])["packingService"]
        svc = max(ps["minChargeInr"], it["units"] * ps["pricePerPackInr"])
    return (max(it["units"], p["moqUnits"]) * p["unitPriceInr"][it["sizeKey"]] + p["setupCostInr"] + it["consumablesInr"] + it["outerInr"] + svc
            + it["labourMinutes"] / 60 * DEFAULT_COST_SETTINGS["labourInrPerHour"])
