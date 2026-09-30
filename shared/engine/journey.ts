// Journey exposure: converts route, weather and vehicle/storage descriptions
// into an exposure profile. Outdoor weather does NOT establish conditions inside
// a vehicle or package — in-vehicle values are explicitly labelled as assumed.
import type { ExposureSegment } from "./moisture";

export type VehicleType = "closed-goods" | "open-truck" | "reefer" | "bus-parcel" | "two-wheeler";
export type StorageType = "ambient-room" | "cool-room" | "cold-room" | "retail-shelf";

export interface Place { name: string; lat: number; lon: number; state?: string }

export interface WeatherDay { date: string; tMax: number; tMin: number; rhMean: number; precipProb: number | null; source: "forecast" | "last-year-observed" | "assumed" }

export interface JourneyAnalysis {
  origin: Place;
  destination: Place;
  distanceKm: number;
  driveHours: number;
  routeSource: "osrm" | "straight-line-estimate" | "user";
  departureDate: string;
  transitWeather: WeatherDay[];
  destinationClimate: { tMean: number; rhMean: number; source: WeatherDay["source"]; note: string };
  retrievedAt: string;
  warnings: string[];
}

export interface TransportOption {
  id: string;
  mode: "shared-load" | "dedicated" | "reefer";
  label: string;
  vehicle: VehicleType;
  transitHours: number;
  costInr: number;
  setpointC?: number;
  handoffs: number;
  simulated: true;
  note: string;
}

/** Simulated rate card (source SIM). */
export function transportOptions(a: JourneyAnalysis, totalKg: number, reeferSetpointC?: number): TransportOption[] {
  const km = a.distanceKm;
  const opts: TransportOption[] = [
    {
      id: "shared", mode: "shared-load", label: "Shared-load goods transport (part load)", vehicle: "closed-goods",
      transitHours: a.driveHours + 20, costInr: Math.max(450, totalKg * (2 + 0.012 * km)), handoffs: 2, simulated: true,
      note: "Consolidated at a transport hub; typically next-day delivery. Extra handling at hub."
    },
    {
      id: "dedicated", mode: "dedicated", label: "Dedicated small goods vehicle (≈1 t, enclosed)", vehicle: "closed-goods",
      transitHours: a.driveHours + 2, costInr: Math.max(1600, 24 * km), handoffs: 0, simulated: true,
      note: "Door-to-door, same day. Choose early-morning dispatch to reduce heat exposure."
    }
  ];
  if (reeferSetpointC !== undefined) {
    opts.push({
      id: "reefer", mode: "reefer", label: `Refrigerated small truck (set to ${reeferSetpointC} °C)`, vehicle: "reefer",
      transitHours: a.driveHours + 3, costInr: Math.max(4200, 42 * km), handoffs: 0, setpointC: reeferSetpointC, simulated: true,
      note: "Select only when the product and conditions justify refrigeration. Pre-cool produce before loading."
    });
  }
  return opts.map((o) => ({ ...o, costInr: Math.round(o.costInr) }));
}

/** Transit exposure (assumed in-vehicle conditions derived from outdoor weather). */
export function transitSegments(a: JourneyAnalysis, t: TransportOption, delay?: { extraHours: number; extraC: number }): ExposureSegment[] {
  const hours = t.transitHours + (delay?.extraHours ?? 0);
  const w = a.transitWeather[0];
  const tMax = w ? w.tMax : 34;
  const tMin = w ? w.tMin : 26;
  const rh = w ? w.rhMean : 75;
  let tC: number;
  let label: string;
  if (t.vehicle === "reefer") { tC = (t.setpointC ?? 12) + 1; label = `Transit — refrigerated (${t.setpointC} °C set)`; }
  else if (t.vehicle === "open-truck") { tC = (tMax + tMin) / 2 + 3; label = "Transit — open vehicle"; }
  else {
    // enclosed metal body: daytime solar gain assumed +5 °C above outdoor mean-of-max
    tC = t.transitHours <= 8 ? tMax + 5 : (tMax + tMin) / 2 + 3;
    label = t.mode === "shared-load" ? "Transit — shared load incl. hub dwell" : "Transit — enclosed vehicle";
  }
  tC += delay?.extraC ?? 0;
  return [{ label, days: Math.max(hours / 24, 0.1), tC: round1(tC), rhPct: t.vehicle === "reefer" ? 90 : clampRh(rh + (t.vehicle === "open-truck" ? 5 : 0)), status: "assumed" }];
}

export interface StorageSpec { type: StorageType; tC?: number; rhPct?: number; status: "measured" | "user" | "assumed" }

export function storageSegment(a: JourneyAnalysis, s: StorageSpec, days: number, label = "Destination storage"): ExposureSegment {
  const clim = a.destinationClimate;
  let tC = s.tC, rh = s.rhPct;
  let status: ExposureSegment["status"] = s.status === "measured" ? "measured" : s.tC !== undefined ? "user" : "assumed";
  if (tC === undefined) tC = s.type === "cold-room" ? 4 : s.type === "cool-room" ? 15 : clim.tMean + 2;
  if (rh === undefined) rh = s.type === "cold-room" ? 90 : s.type === "cool-room" ? 70 : clim.rhMean;
  if (s.tC === undefined || s.rhPct === undefined) status = "assumed";
  return { label: `${label} (${storageLabel(s.type)})`, days, tC: round1(tC), rhPct: clampRh(rh), status };
}

export function storageLabel(t: StorageType) {
  return { "ambient-room": "ordinary room", "cool-room": "cool room", "cold-room": "cold room", "retail-shelf": "retail shelf" }[t];
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const clampRh = (x: number) => Math.min(98, Math.max(20, Math.round(x)));

/** Straight-line distance with a road-winding factor, used when routing is unavailable. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Offline fallback analysis — everything assumed, clearly labelled. */
export function offlineJourney(origin: Place, destination: Place, departureDate: string, assumed = { tMax: 34, tMin: 26, rh: 75 }): JourneyAnalysis {
  const km = haversineKm(origin, destination) * 1.3;
  return {
    origin, destination, distanceKm: Math.round(km), driveHours: Math.round((km / 40) * 10) / 10, routeSource: "straight-line-estimate", departureDate,
    transitWeather: [{ date: departureDate, tMax: assumed.tMax, tMin: assumed.tMin, rhMean: assumed.rh, precipProb: null, source: "assumed" }],
    destinationClimate: { tMean: (assumed.tMax + assumed.tMin) / 2, rhMean: assumed.rh, source: "assumed", note: "Offline: assumed tropical coastal conditions. Replace with a room hygrometer reading." },
    retrievedAt: new Date().toISOString(),
    warnings: ["Computed offline: route distance is a straight-line estimate × 1.3 and weather is an assumed scenario."]
  };
}
