// Route and weather analysis using public services (Open-Meteo, OSRM), with a
// labelled offline fallback. Results record their source and retrieval time.
import { haversineKm, offlineJourney, type JourneyAnalysis, type Place, type WeatherDay } from "../shared/engine/journey";

const cache = new Map<string, { at: number; value: unknown }>();
async function getJson(url: string, ttlMs = 30 * 60 * 1000): Promise<any> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { "User-Agent": "PackWise-SIH26236-prototype" } });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  const value = await res.json();
  cache.set(url, { at: Date.now(), value });
  return value;
}

export async function geocode(q: string): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&countryCode=IN`;
  const data = await getJson(url, 24 * 3600 * 1000);
  return (data.results ?? []).map((r: any) => ({ name: [r.name, r.admin2, r.admin1].filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(", "), lat: r.latitude, lon: r.longitude, state: r.admin1 }));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);

export async function analyzeJourney(origin: Place, destination: Place, departureDate: string, storageDays: number): Promise<JourneyAnalysis> {
  const warnings: string[] = [];
  let distanceKm: number, driveHours: number, routeSource: JourneyAnalysis["routeSource"] = "osrm";
  try {
    const r = await getJson(`https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`);
    distanceKm = r.routes[0].distance / 1000;
    driveHours = (r.routes[0].duration / 3600) * 1.35; // goods vehicles are slower than cars (assumption)
  } catch {
    distanceKm = haversineKm(origin, destination) * 1.3;
    driveHours = distanceKm / 40;
    routeSource = "straight-line-estimate";
    warnings.push("Routing service unavailable — distance estimated as straight line × 1.3 at 40 km/h.");
  }
  const today = iso(new Date());
  const daysAhead = Math.round((new Date(departureDate).getTime() - new Date(today).getTime()) / 86400000);
  const transitDays = Math.max(1, Math.ceil(driveHours / 24) + 1);
  let transitWeather: WeatherDay[] = [];
  const midLat = (origin.lat + destination.lat) / 2, midLon = (origin.lon + destination.lon) / 2;
  try {
    if (daysAhead >= 0 && daysAhead + transitDays <= 15) {
      const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${midLat}&longitude=${midLon}&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_probability_max&timezone=Asia%2FKolkata&start_date=${departureDate}&end_date=${addDays(departureDate, transitDays - 1)}`);
      transitWeather = f.daily.time.map((t: string, i: number) => ({ date: t, tMax: f.daily.temperature_2m_max[i], tMin: f.daily.temperature_2m_min[i], rhMean: f.daily.relative_humidity_2m_mean[i], precipProb: f.daily.precipitation_probability_max?.[i] ?? null, source: "forecast" as const }));
    } else {
      warnings.push("Departure is beyond the forecast horizon — transit weather uses last year's observations for the same dates (an assumed scenario).");
    }
  } catch { warnings.push("Weather forecast unavailable."); }
  if (!transitWeather.length) {
    try {
      const ly = addDays(departureDate, -365);
      const a = await getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${midLat}&longitude=${midLon}&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=Asia%2FKolkata&start_date=${ly}&end_date=${addDays(ly, transitDays - 1)}`, 24 * 3600 * 1000);
      transitWeather = a.daily.time.map((t: string, i: number) => ({ date: addDays(t, 365), tMax: a.daily.temperature_2m_max[i], tMin: a.daily.temperature_2m_min[i], rhMean: a.daily.relative_humidity_2m_mean[i], precipProb: null, source: "last-year-observed" as const }));
    } catch { /* fall through */ }
  }
  let destinationClimate: JourneyAnalysis["destinationClimate"];
  try {
    const start = addDays(departureDate, -365);
    const end = addDays(start, Math.min(Math.max(Math.ceil(storageDays), 7), 180));
    const a = await getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${destination.lat}&longitude=${destination.lon}&daily=temperature_2m_mean,relative_humidity_2m_mean&timezone=Asia%2FKolkata&start_date=${start}&end_date=${end}`, 24 * 3600 * 1000);
    const t = a.daily.temperature_2m_mean.filter((x: number | null) => x !== null);
    const h = a.daily.relative_humidity_2m_mean.filter((x: number | null) => x !== null);
    destinationClimate = { tMean: Math.round(mean(t) * 10) / 10, rhMean: Math.round(mean(h)), source: "last-year-observed", note: `Outdoor mean for the same period last year (${start} to ${end}). Room conditions differ — a room hygrometer reading replaces this assumption.` };
  } catch {
    const off = offlineJourney(origin, destination, departureDate);
    destinationClimate = off.destinationClimate;
    warnings.push("Climate data unavailable — destination storage uses an assumed tropical scenario.");
  }
  if (!transitWeather.length) {
    transitWeather = offlineJourney(origin, destination, departureDate).transitWeather;
    warnings.push("Transit weather is an assumed scenario (34 °C max / 26 °C min / 75% RH).");
  }
  const rain = transitWeather.find((w) => (w.precipProb ?? 0) >= 60);
  if (rain) warnings.push(`Rain likely on ${rain.date} (${rain.precipProb}%): use an enclosed vehicle or tarpaulin; corrugated cartons lose strength when wet.`);
  return {
    origin, destination, distanceKm: Math.round(distanceKm), driveHours: Math.round(driveHours * 10) / 10, routeSource, departureDate,
    transitWeather, destinationClimate, retrievedAt: new Date().toISOString(), warnings
  };
}
