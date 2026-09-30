// Core domain types shared by the browser (offline engine) and the server.

/** Every decision-relevant input carries a status (discussion record p.3). */
export type InputStatus = "measured" | "reported" | "reference" | "assumed" | "unknown";

/** A numeric value with provenance. `lo`/`hi` describe the plausible range used for uncertainty. */
export interface Evidenced {
  value: number;
  lo?: number;
  hi?: number;
  unit: string;
  status: InputStatus;
  sourceId?: string; // key into SOURCES
  note?: string;
  date?: string; // ISO date the value was measured/reported/retrieved
}

export type ReviewStatus = "expert-reviewed" | "unreviewed-seed";

export type FoodClass = "dry" | "fresh" | "wet-processed" | "chilled-perishable";

export type ProcessingState =
  | "fresh-whole"
  | "fresh-cut"
  | "dried"
  | "unroasted"
  | "roasted"
  | "fried"
  | "milled"
  | "processed"
  | "frozen";

export interface Commodity {
  id: string;
  name: string;
  names: { ta?: string; hi?: string };
  aliases: string[];
  foodClass: FoodClass;
  states: ProcessingState[];
  defaultState: ProcessingState;
  icon: string;
  bulkDensityKgPerL: number; // for pack sizing (reference estimate)
  review: ReviewStatus;
  /** Dry-food moisture model inputs (wet basis %, linear isotherm on dry basis). */
  moisture?: {
    initialWb: Evidenced; // % wet basis
    criticalWb: Evidenced; // % wet basis at which quality/safety limit is reached
    direction: "gain" | "loss";
    isoA: Evidenced; // intercept, g water / g solids
    isoB: Evidenced; // slope, g water / g solids per unit aw
    isoRange: [number, number]; // aw range where the linear isotherm is considered applicable
    criticalReason: string;
  };
  /** Oxidation sensitivity: tolerable total O2 uptake (mg O2 / kg food == ppm w/w). */
  oxygen?: {
    tolerancePpm: Evidenced;
    reason: string;
  };
  lightSensitive: boolean;
  /** Fresh-produce respiration + recommended atmosphere. */
  respiration?: {
    rco2At20: Evidenced; // mg CO2 / kg / h at 20 C in air
    q10: Evidenced;
    rq: Evidenced;
    kmO2: Evidenced; // Michaelis-Menten constant, O2 fraction (e.g. 0.03)
    targetO2: [number, number]; // fraction
    targetCo2: [number, number]; // fraction
    minO2: number; // below this, anaerobic risk
    maxCo2: number; // above this, CO2 injury risk
    storageTempC: [number, number];
    chillingInjuryBelowC?: number;
    ethyleneProducer: boolean;
    ethyleneSensitive: boolean;
    maxStorageDaysAtOptimum: [number, number];
    sourceIdGas: string;
  };
  /** Wet / acidified foods: which measurements are decision-critical. */
  requiredMeasurements?: Array<{ key: string; label: string; why: string; howToMeasure: string }>;
  mechanical: {
    fragility: "low" | "medium" | "high";
    sharpEdges: boolean;
    crushable: boolean;
  };
  insectRisk: boolean;
  storageAdvice: string;
  disposalNote?: string;
  commercialExample?: { format: string; illustration: PackFormat; explanation: string };
  notes: string[];
}

export type PackFormat =
  | "pillow-pouch"
  | "stand-up-pouch"
  | "vacuum-pack"
  | "tin"
  | "sack-liner"
  | "crate"
  | "clamshell"
  | "jar"
  | "carton"
  | "tray-film";

export type RecyclabilityFamily = "PE" | "PP" | "PET" | "paper" | "metal" | "glass" | "mixed-plastic" | "multi-material" | "compostable";

export interface Material {
  id: string;
  name: string;
  commonName: string;
  /** OTR at reference thickness, 23 C, 0% RH (cc(STP)/m2/day/atm). */
  otrRef: number;
  /** OTR at reference thickness, 23 C, ~80% RH (for humidity sensitive polymers). */
  otrRefHighRh?: number;
  /** WVTR at reference thickness, 38 C / 90% RH (g/m2/day). */
  wvtrRef: number;
  refThicknessUm: number;
  thicknessScalable: boolean; // false for coatings / metallisation / foil
  co2O2Ratio: number; // beta = CO2TR / OTR
  densityGcc: number;
  ePermO2kJ: number; // activation energy for O2 permeation
  ePermH2OkJ: number;
  sealant?: { minC: number; maxC: number };
  heatResistantC: number;
  punctureIndex: number; // relative, per 25 um (1 = LDPE)
  lightBarrier: boolean;
  family: RecyclabilityFamily;
  co2eKgPerKg: [number, number]; // indicative cradle-to-gate range
  pricePerKgInr: [number, number]; // indicative
  foodContactNote: string;
  sourceId: string;
}

export interface Layer {
  materialId: string;
  thicknessUm: number;
}

export type SealMethod =
  | "heat-impulse"
  | "band-sealer"
  | "vacuum-chamber"
  | "vacuum-gas-flush"
  | "tray-sealer"
  | "can-seamer"
  | "sack-stitch"
  | "screw-cap"
  | "clip-tie"
  | "none";

export interface Structure {
  id: string;
  name: string;
  layers: Layer[];
  format: PackFormat;
  kind: "primary" | "bulk-liner" | "rigid" | "outer";
  sealMethods: SealMethod[];
  suitableFor: FoodClass[];
  microperforatable: boolean;
  sizesKg: number[]; // commonly available fill sizes
  /** For rigid containers: fixed per-unit performance instead of layer calc. */
  rigid?: { otrPerPackCcDay: number; wvtrPerPackGDay: number; massG: number; refSizeKg: number; family: RecyclabilityFamily };
  antiFog?: boolean;
  zipper?: boolean;
  transparency: "clear" | "opaque" | "translucent";
  notes: string;
  sourceId: string;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  structureId: string;
  sizesKg: number[];
  unitPriceInr: Record<string, number>; // keyed by size kg
  moqUnits: number;
  setupCostInr: number; // printing plates, tooling
  leadTimeDays: number;
  documentation: "third-party-test-report" | "supplier-declared" | "none";
  declared: { otr?: number; wvtr?: number; testConditions: string; reportDate?: string };
  materialLotPrefix: string;
}

export interface Supplier {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  deliversTo: string[]; // states / "all-india"
  simulated: true;
  services: Array<"material" | "packing-service">;
  packingService?: { methods: SealMethod[]; pricePerPackInr: number; minChargeInr: number; city: string };
  contactNote: string;
}

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  year?: string;
  kind: "standard" | "textbook" | "database" | "paper" | "regulation" | "seed" | "simulated" | "user";
  note?: string;
}
