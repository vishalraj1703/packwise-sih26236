"""Route and weather analysis using public services (Open-Meteo, OSRM) with a labelled offline fallback.

Providers are configurable; results record their source and retrieval time.
"""
from __future__ import annotations

import math
import os
import time
from datetime import date, datetime, timedelta, timezone

import httpx

from ..engine.journey import haversine_km, offline_journey

GEOCODE_URL = os.environ.get("GEOCODE_URL", "https://geocoding-api.open-meteo.com/v1/search")
FORECAST_URL = os.environ.get("FORECAST_URL", "https://api.open-meteo.com/v1/forecast")
ARCHIVE_URL = os.environ.get("ARCHIVE_URL", "https://archive-api.open-meteo.com/v1/archive")
ROUTE_URL = os.environ.get("ROUTE_URL", "https://router.project-osrm.org/route/v1/driving")
HEADERS = {"User-Agent": "PackWise-SIH26236-prototype"}
_cache: dict[str, tuple[float, object]] = {}


async def _get(client: httpx.AsyncClient, url: str, params: dict | None = None, ttl: float = 1800):
    key = url + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    r = await client.get(url, params=params, headers=HEADERS, timeout=9)
    r.raise_for_status()
    data = r.json()
    _cache[key] = (time.time(), data)
    return data


async def geocode(q: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        d = await _get(client, GEOCODE_URL, {"name": q, "count": 6, "language": "en", "countryCode": "IN"}, ttl=86400)
    out = []
    for r in d.get("results") or []:
        parts = list(dict.fromkeys(x for x in (r.get("name"), r.get("admin2"), r.get("admin1")) if x))
        out.append({"name": ", ".join(parts), "lat": r["latitude"], "lon": r["longitude"], "state": r.get("admin1")})
    return out


def _add(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


async def analyze_journey(origin: dict, destination: dict, departure: str, storage_days: float) -> dict:
    warnings: list[str] = []
    route_source = "osrm"
    async with httpx.AsyncClient() as client:
        try:
            r = await _get(client, f'{ROUTE_URL}/{origin["lon"]},{origin["lat"]};{destination["lon"]},{destination["lat"]}', {"overview": "false"})
            distance_km = r["routes"][0]["distance"] / 1000
            drive_hours = r["routes"][0]["duration"] / 3600 * 1.35  # goods vehicles are slower than cars (assumption)
        except Exception:  # noqa: BLE001
            distance_km = haversine_km(origin, destination) * 1.3
            drive_hours = distance_km / 40
            route_source = "straight-line-estimate"
            warnings.append("Routing service unavailable — distance estimated as straight line × 1.3 at 40 km/h.")
        today = datetime.now(timezone.utc).date()
        days_ahead = (date.fromisoformat(departure) - today).days
        transit_days = max(1, math.ceil(drive_hours / 24) + 1)
        mid_lat, mid_lon = (origin["lat"] + destination["lat"]) / 2, (origin["lon"] + destination["lon"]) / 2
        weather: list[dict] = []
        try:
            if 0 <= days_ahead and days_ahead + transit_days <= 15:
                f = await _get(client, FORECAST_URL, {"latitude": mid_lat, "longitude": mid_lon, "timezone": "Asia/Kolkata", "start_date": departure, "end_date": _add(departure, transit_days - 1),
                                                     "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_probability_max"})
                dd = f["daily"]
                weather = [{"date": t, "tMax": dd["temperature_2m_max"][i], "tMin": dd["temperature_2m_min"][i], "rhMean": dd["relative_humidity_2m_mean"][i],
                            "precipProb": (dd.get("precipitation_probability_max") or [None] * 99)[i], "source": "forecast"} for i, t in enumerate(dd["time"])]
            else:
                warnings.append("Departure is beyond the forecast horizon — transit weather uses last year's observations for the same dates (an assumed scenario).")
        except Exception:  # noqa: BLE001
            warnings.append("Weather forecast unavailable.")
        if not weather:
            try:
                ly = _add(departure, -365)
                a = await _get(client, ARCHIVE_URL, {"latitude": mid_lat, "longitude": mid_lon, "timezone": "Asia/Kolkata", "start_date": ly, "end_date": _add(ly, transit_days - 1),
                                                    "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean"}, ttl=86400)
                dd = a["daily"]
                weather = [{"date": _add(t, 365), "tMax": dd["temperature_2m_max"][i], "tMin": dd["temperature_2m_min"][i], "rhMean": dd["relative_humidity_2m_mean"][i],
                            "precipProb": None, "source": "last-year-observed"} for i, t in enumerate(dd["time"])]
            except Exception:  # noqa: BLE001
                pass
        try:
            start = _add(departure, -365)
            end = _add(start, int(min(max(storage_days, 7), 180)))
            a = await _get(client, ARCHIVE_URL, {"latitude": destination["lat"], "longitude": destination["lon"], "timezone": "Asia/Kolkata", "start_date": start, "end_date": end,
                                                "daily": "temperature_2m_mean,relative_humidity_2m_mean"}, ttl=86400)
            t = [x for x in a["daily"]["temperature_2m_mean"] if x is not None]
            h = [x for x in a["daily"]["relative_humidity_2m_mean"] if x is not None]
            climate = {"tMean": round(sum(t) / len(t), 1), "rhMean": round(sum(h) / len(h)), "source": "last-year-observed",
                       "note": f"Outdoor mean for the same period last year ({start} to {end}). Room conditions differ — a room hygrometer reading replaces this assumption."}
        except Exception:  # noqa: BLE001
            climate = offline_journey(origin, destination, departure)["destinationClimate"]
            warnings.append("Climate data unavailable — destination storage uses an assumed tropical scenario.")
    if not weather:
        weather = offline_journey(origin, destination, departure)["transitWeather"]
        warnings.append("Transit weather is an assumed scenario (34 °C max / 26 °C min / 75% RH).")
    rain = next((w for w in weather if (w.get("precipProb") or 0) >= 60), None)
    if rain:
        warnings.append(f'Rain likely on {rain["date"]} ({rain["precipProb"]}%): use an enclosed vehicle or tarpaulin; corrugated cartons lose strength when wet.')
    return {"origin": origin, "destination": destination, "distanceKm": round(distance_km), "driveHours": round(drive_hours, 1), "routeSource": route_source,
            "departureDate": departure, "transitWeather": weather, "destinationClimate": climate,
            "retrievedAt": datetime.now(timezone.utc).isoformat(), "warnings": warnings}
