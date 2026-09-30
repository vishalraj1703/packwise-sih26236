"""Journey exposure. Outdoor weather does NOT establish in-vehicle conditions — values are labelled assumed."""
from __future__ import annotations

import math
from datetime import datetime, timezone


def transport_options(a: dict, total_kg: float, reefer_setpoint_c: float | None = None) -> list[dict]:
    """Simulated rate card (source SIM)."""
    km = a["distanceKm"]
    opts = [
        {"id": "shared", "mode": "shared-load", "label": "Shared-load goods transport (part load)", "vehicle": "closed-goods",
         "transitHours": a["driveHours"] + 20, "costInr": max(450, total_kg * (2 + 0.012 * km)), "handoffs": 2, "simulated": True,
         "note": "Consolidated at a transport hub; typically next-day delivery. Extra handling at hub."},
        {"id": "dedicated", "mode": "dedicated", "label": "Dedicated small goods vehicle (≈1 t, enclosed)", "vehicle": "closed-goods",
         "transitHours": a["driveHours"] + 2, "costInr": max(1600, 24 * km), "handoffs": 0, "simulated": True,
         "note": "Door-to-door, same day. Choose early-morning dispatch to reduce heat exposure."},
    ]
    if reefer_setpoint_c is not None:
        opts.append({"id": "reefer", "mode": "reefer", "label": f"Refrigerated small truck (set to {reefer_setpoint_c:g} °C)", "vehicle": "reefer",
                     "transitHours": a["driveHours"] + 3, "costInr": max(4200, 42 * km), "handoffs": 0, "setpointC": reefer_setpoint_c, "simulated": True,
                     "note": "Select only when the product and conditions justify refrigeration. Pre-cool produce before loading."})
    for o in opts:
        o["costInr"] = round(o["costInr"])
    return opts


def _clamp_rh(x: float) -> int:
    return int(min(98, max(20, round(x))))


def transit_segments(a: dict, t: dict, delay: dict | None = None) -> list[dict]:
    hours = t["transitHours"] + (delay or {}).get("extraHours", 0)
    w = a["transitWeather"][0] if a.get("transitWeather") else None
    t_max = w["tMax"] if w else 34
    t_min = w["tMin"] if w else 26
    rh = w["rhMean"] if w else 75
    if t["vehicle"] == "reefer":
        tc, label = t.get("setpointC", 12) + 1, f'Transit — refrigerated ({t.get("setpointC"):g} °C set)'
    elif t["vehicle"] == "open-truck":
        tc, label = (t_max + t_min) / 2 + 3, "Transit — open vehicle"
    else:
        # enclosed metal body: daytime solar gain assumed +5 °C above outdoor maximum
        tc = t_max + 5 if t["transitHours"] <= 8 else (t_max + t_min) / 2 + 3
        label = "Transit — shared load incl. hub dwell" if t["mode"] == "shared-load" else "Transit — enclosed vehicle"
    tc += (delay or {}).get("extraC", 0)
    return [{"label": label, "days": max(hours / 24, 0.1), "tC": round(tc, 1),
             "rhPct": 90 if t["vehicle"] == "reefer" else _clamp_rh(rh + (5 if t["vehicle"] == "open-truck" else 0)), "status": "assumed"}]


STORAGE_LABEL = {"ambient-room": "ordinary room", "cool-room": "cool room", "cold-room": "cold room", "retail-shelf": "retail shelf"}


def storage_segment(a: dict, s: dict, days: float, label: str = "Destination storage") -> dict:
    clim = a["destinationClimate"]
    tc, rh = s.get("tC"), s.get("rhPct")
    status = "measured" if s.get("status") == "measured" else ("user" if tc is not None else "assumed")
    if tc is None:
        tc = 4 if s["type"] == "cold-room" else 15 if s["type"] == "cool-room" else clim["tMean"] + 2
    if rh is None:
        rh = 90 if s["type"] == "cold-room" else 70 if s["type"] == "cool-room" else clim["rhMean"]
    if s.get("tC") is None or s.get("rhPct") is None:
        status = "assumed"
    return {"label": f'{label} ({STORAGE_LABEL[s["type"]]})', "days": days, "tC": round(tc, 1), "rhPct": _clamp_rh(rh), "status": status}


def haversine_km(a: dict, b: dict) -> float:
    r = 6371
    d_lat, d_lon = math.radians(b["lat"] - a["lat"]), math.radians(b["lon"] - a["lon"])
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(d_lon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def offline_journey(origin: dict, destination: dict, departure_date: str, assumed: dict | None = None) -> dict:
    """Fallback analysis — everything assumed, clearly labelled."""
    a = assumed or {"tMax": 34, "tMin": 26, "rh": 75}
    km = haversine_km(origin, destination) * 1.3
    return {
        "origin": origin, "destination": destination, "distanceKm": round(km), "driveHours": round(km / 40, 1), "routeSource": "straight-line-estimate",
        "departureDate": departure_date,
        "transitWeather": [{"date": departure_date, "tMax": a["tMax"], "tMin": a["tMin"], "rhMean": a["rh"], "precipProb": None, "source": "assumed"}],
        "destinationClimate": {"tMean": (a["tMax"] + a["tMin"]) / 2, "rhMean": a["rh"], "source": "assumed",
                               "note": "Offline: assumed tropical coastal conditions. Replace with a room hygrometer reading."},
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "warnings": ["Computed offline: route distance is a straight-line estimate × 1.3 and weather is an assumed scenario."],
    }
