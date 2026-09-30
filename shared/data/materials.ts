import type { Material, Structure } from "../types";

// Generic, literature-typical barrier values (POLYMER-HANDBOOK). A supplier's
// film is always matched on its own documented test report; these generic
// values only support screening and are shown as "reference" data.
export const MATERIALS: Record<string, Material> = {
  LDPE: {
    id: "LDPE", name: "Low-density polyethylene", commonName: "LDPE (polythene)",
    otrRef: 7800, wvtrRef: 18, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 4.5,
    densityGcc: 0.92, ePermO2kJ: 42, ePermH2OkJ: 45, sealant: { minC: 110, maxC: 150 }, heatResistantC: 80,
    punctureIndex: 1.0, lightBarrier: false, family: "PE", co2eKgPerKg: [1.8, 2.2], pricePerKgInr: [110, 140],
    foodContactNote: "Food-grade LDPE needs a supplier declaration of compliance (e.g. IS 10146 / FSSAI packaging regulations).",
    sourceId: "POLYMER-HANDBOOK"
  },
  LLDPE: {
    id: "LLDPE", name: "Linear low-density polyethylene", commonName: "LLDPE",
    otrRef: 7000, wvtrRef: 16, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 4.3,
    densityGcc: 0.92, ePermO2kJ: 42, ePermH2OkJ: 45, sealant: { minC: 115, maxC: 160 }, heatResistantC: 85,
    punctureIndex: 1.4, lightBarrier: false, family: "PE", co2eKgPerKg: [1.8, 2.2], pricePerKgInr: [115, 145],
    foodContactNote: "Tough sealant layer; check food-contact declaration.", sourceId: "POLYMER-HANDBOOK"
  },
  HDPE: {
    id: "HDPE", name: "High-density polyethylene", commonName: "HDPE",
    otrRef: 2000, wvtrRef: 6, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 3.5,
    densityGcc: 0.95, ePermO2kJ: 35, ePermH2OkJ: 45, sealant: { minC: 130, maxC: 160 }, heatResistantC: 110,
    punctureIndex: 0.9, lightBarrier: false, family: "PE", co2eKgPerKg: [1.8, 2.0], pricePerKgInr: [115, 140],
    foodContactNote: "Check food-contact declaration.", sourceId: "POLYMER-HANDBOOK"
  },
  CPP: {
    id: "CPP", name: "Cast polypropylene", commonName: "CPP",
    otrRef: 3500, wvtrRef: 10, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 3.5,
    densityGcc: 0.9, ePermO2kJ: 40, ePermH2OkJ: 45, sealant: { minC: 140, maxC: 180 }, heatResistantC: 120,
    punctureIndex: 1.1, lightBarrier: false, family: "PP", co2eKgPerKg: [1.6, 2.0], pricePerKgInr: [125, 155],
    foodContactNote: "Check food-contact declaration.", sourceId: "POLYMER-HANDBOOK"
  },
  BOPP: {
    id: "BOPP", name: "Biaxially oriented polypropylene", commonName: "BOPP",
    otrRef: 1800, wvtrRef: 5, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 3.5,
    densityGcc: 0.91, ePermO2kJ: 40, ePermH2OkJ: 45, heatResistantC: 130,
    punctureIndex: 1.2, lightBarrier: false, family: "PP", co2eKgPerKg: [1.6, 2.0], pricePerKgInr: [130, 160],
    foodContactNote: "Plain BOPP is not heat-sealable without a sealant skin.", sourceId: "POLYMER-HANDBOOK"
  },
  "MET-BOPP": {
    id: "MET-BOPP", name: "Metallised heat-sealable BOPP", commonName: "Metallised BOPP (chips-bag film)",
    otrRef: 60, wvtrRef: 0.4, refThicknessUm: 20, thicknessScalable: false, co2O2Ratio: 3.5,
    densityGcc: 0.91, ePermO2kJ: 30, ePermH2OkJ: 35, sealant: { minC: 120, maxC: 150 }, heatResistantC: 130,
    punctureIndex: 1.1, lightBarrier: true, family: "PP", co2eKgPerKg: [1.8, 2.3], pricePerKgInr: [160, 200],
    foodContactNote: "Metal layer can crack on flexing; barrier varies strongly between suppliers.", sourceId: "POLYMER-HANDBOOK"
  },
  PET: {
    id: "PET", name: "Biaxially oriented polyester", commonName: "Polyester (PET)",
    otrRef: 110, wvtrRef: 45, refThicknessUm: 12, thicknessScalable: true, co2O2Ratio: 4.5,
    densityGcc: 1.39, ePermO2kJ: 30, ePermH2OkJ: 40, heatResistantC: 200,
    punctureIndex: 1.5, lightBarrier: false, family: "PET", co2eKgPerKg: [2.2, 3.0], pricePerKgInr: [140, 175],
    foodContactNote: "Print/outer layer; not heat-sealable.", sourceId: "POLYMER-HANDBOOK"
  },
  "MET-PET": {
    id: "MET-PET", name: "Metallised polyester", commonName: "Metallised PET",
    otrRef: 1.0, wvtrRef: 1.0, refThicknessUm: 12, thicknessScalable: false, co2O2Ratio: 4,
    densityGcc: 1.39, ePermO2kJ: 25, ePermH2OkJ: 30, heatResistantC: 200,
    punctureIndex: 1.5, lightBarrier: true, family: "PET", co2eKgPerKg: [2.4, 3.2], pricePerKgInr: [170, 210],
    foodContactNote: "Barrier depends on optical density and handling (flex cracking).", sourceId: "POLYMER-HANDBOOK"
  },
  "ALOX-PET": {
    id: "ALOX-PET", name: "Aluminium-oxide coated polyester", commonName: "Transparent barrier PET (AlOx)",
    otrRef: 1.0, wvtrRef: 1.0, refThicknessUm: 12, thicknessScalable: false, co2O2Ratio: 4,
    densityGcc: 1.39, ePermO2kJ: 25, ePermH2OkJ: 30, heatResistantC: 200,
    punctureIndex: 1.5, lightBarrier: false, family: "PET", co2eKgPerKg: [2.4, 3.2], pricePerKgInr: [230, 300],
    foodContactNote: "Transparent; product remains exposed to light.", sourceId: "POLYMER-HANDBOOK"
  },
  BOPA: {
    id: "BOPA", name: "Biaxially oriented polyamide", commonName: "Nylon (BOPA)",
    otrRef: 45, otrRefHighRh: 90, wvtrRef: 230, refThicknessUm: 15, thicknessScalable: true, co2O2Ratio: 4,
    densityGcc: 1.14, ePermO2kJ: 35, ePermH2OkJ: 35, heatResistantC: 200,
    punctureIndex: 4.0, lightBarrier: false, family: "mixed-plastic", co2eKgPerKg: [7, 9], pricePerKgInr: [280, 350],
    foodContactNote: "Puncture-resistant layer for vacuum packs; oxygen barrier falls at high humidity.", sourceId: "POLYMER-HANDBOOK"
  },
  EVOH: {
    id: "EVOH", name: "Ethylene vinyl alcohol (32 mol% ethylene)", commonName: "EVOH barrier layer",
    otrRef: 0.4, otrRefHighRh: 3.5, wvtrRef: 40, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 3,
    densityGcc: 1.19, ePermO2kJ: 40, ePermH2OkJ: 40, heatResistantC: 180,
    punctureIndex: 0.8, lightBarrier: false, family: "mixed-plastic", co2eKgPerKg: [4, 6], pricePerKgInr: [650, 900],
    foodContactNote: "Very humidity-sensitive; must be buried between moisture-barrier layers.", sourceId: "POLYMER-HANDBOOK"
  },
  AL: {
    id: "AL", name: "Aluminium foil", commonName: "Aluminium foil",
    otrRef: 0.05, wvtrRef: 0.05, refThicknessUm: 9, thicknessScalable: false, co2O2Ratio: 1,
    densityGcc: 2.7, ePermO2kJ: 10, ePermH2OkJ: 10, heatResistantC: 400,
    punctureIndex: 0.5, lightBarrier: true, family: "metal", co2eKgPerKg: [8, 12], pricePerKgInr: [380, 460],
    foodContactNote: "Near-total barrier if free of pinholes/flex cracks; laminate is not recyclable in common streams.", sourceId: "POLYMER-HANDBOOK"
  },
  KRAFT: {
    id: "KRAFT", name: "Kraft paper (~60 g/m²)", commonName: "Kraft paper",
    otrRef: 1e6, wvtrRef: 1500, refThicknessUm: 75, thicknessScalable: false, co2O2Ratio: 1,
    densityGcc: 0.8, ePermO2kJ: 5, ePermH2OkJ: 5, heatResistantC: 200,
    punctureIndex: 0.6, lightBarrier: true, family: "paper", co2eKgPerKg: [0.8, 1.3], pricePerKgInr: [70, 95],
    foodContactNote: "No barrier on its own; provides stiffness, print surface and light protection.", sourceId: "POLYMER-HANDBOOK"
  },
  CELLULOSE: {
    id: "CELLULOSE", name: "Coated regenerated cellulose film", commonName: "Compostable cellulose film",
    otrRef: 5, otrRefHighRh: 30, wvtrRef: 30, refThicknessUm: 23, thicknessScalable: false, co2O2Ratio: 3,
    densityGcc: 1.45, ePermO2kJ: 30, ePermH2OkJ: 30, heatResistantC: 170,
    punctureIndex: 0.9, lightBarrier: false, family: "compostable", co2eKgPerKg: [2, 4], pricePerKgInr: [500, 700],
    foodContactNote: "Barrier strongly depends on coating grade and humidity; compostable only under suitable conditions.", sourceId: "POLYMER-HANDBOOK"
  },
  "COMPOST-SEAL": {
    id: "COMPOST-SEAL", name: "Compostable sealant (PBAT/PBS blend)", commonName: "Compostable sealant",
    otrRef: 1500, wvtrRef: 150, refThicknessUm: 25, thicknessScalable: true, co2O2Ratio: 4,
    densityGcc: 1.25, ePermO2kJ: 35, ePermH2OkJ: 35, sealant: { minC: 100, maxC: 140 }, heatResistantC: 70,
    punctureIndex: 1.2, lightBarrier: false, family: "compostable", co2eKgPerKg: [2, 3.5], pricePerKgInr: [400, 550],
    foodContactNote: "Check certification (e.g. IS/ISO 17088) and local composting availability.", sourceId: "POLYMER-HANDBOOK"
  },
  "WOVEN-PP": {
    id: "WOVEN-PP", name: "Woven polypropylene fabric", commonName: "Woven sack (PP)",
    otrRef: 1e6, wvtrRef: 5000, refThicknessUm: 80, thicknessScalable: false, co2O2Ratio: 1,
    densityGcc: 0.9, ePermO2kJ: 5, ePermH2OkJ: 5, heatResistantC: 120,
    punctureIndex: 8, lightBarrier: false, family: "PP", co2eKgPerKg: [1.6, 2.0], pricePerKgInr: [120, 150],
    foodContactNote: "Mechanical protection only; food contact needs a liner.", sourceId: "POLYMER-HANDBOOK"
  }
};

// Commercially common structures. Rigid containers use per-pack performance at a reference size.
export const STRUCTURES: Structure[] = [
  {
    id: "ldpe-50", name: "LDPE 50 µm pouch", layers: [{ materialId: "LDPE", thicknessUm: 50 }],
    format: "pillow-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer", "clip-tie"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2, 5], transparency: "translucent",
    notes: "Low cost, widely available; modest moisture barrier and poor oxygen barrier.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "ldpe-100-liner", name: "LDPE 100 µm liner in carton / sack", layers: [{ materialId: "LDPE", thicknessUm: 100 }],
    format: "sack-liner", kind: "bulk-liner", sealMethods: ["heat-impulse", "band-sealer", "clip-tie"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [5, 10, 25, 50], transparency: "translucent",
    notes: "Bulk food-contact liner; needs an outer carton or woven sack for handling.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "woven-ldpe-liner", name: "Woven PP sack with LDPE 60 µm liner",
    layers: [{ materialId: "WOVEN-PP", thicknessUm: 80 }, { materialId: "LDPE", thicknessUm: 60 }],
    format: "sack-liner", kind: "bulk-liner", sealMethods: ["sack-stitch", "heat-impulse", "clip-tie"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [10, 25, 50], transparency: "opaque",
    notes: "Common bulk format for grain, flour and nuts; liner provides the moisture barrier.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "bopp-cpp", name: "BOPP 20 / CPP 30 laminate",
    layers: [{ materialId: "BOPP", thicknessUm: 20 }, { materialId: "CPP", thicknessUm: 30 }],
    format: "pillow-pouch", kind: "primary", sealMethods: ["band-sealer", "heat-impulse"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.1, 0.25, 0.5, 1], transparency: "clear",
    notes: "Good moisture barrier for price, clear, mono-polypropylene.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "bopp-metbopp", name: "BOPP 20 / metallised BOPP 20 (mono-PP)",
    layers: [{ materialId: "BOPP", thicknessUm: 20 }, { materialId: "MET-BOPP", thicknessUm: 20 }],
    format: "pillow-pouch", kind: "primary", sealMethods: ["band-sealer", "heat-impulse", "vacuum-gas-flush"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.05, 0.1, 0.25, 0.5], transparency: "opaque",
    notes: "Packaging-format example: typical fried-snack pillow pouch, often nitrogen-flushed.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pet-pe", name: "PET 12 / LDPE 50 stand-up pouch",
    layers: [{ materialId: "PET", thicknessUm: 12 }, { materialId: "LDPE", thicknessUm: 50 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer"],
    suitableFor: ["dry", "wet-processed"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2], zipper: true, transparency: "clear",
    notes: "Printable retail pouch; moderate oxygen barrier.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pet-metpet-pe", name: "PET 12 / Met-PET 12 / LDPE 60 stand-up pouch",
    layers: [{ materialId: "PET", thicknessUm: 12 }, { materialId: "MET-PET", thicknessUm: 12 }, { materialId: "LDPE", thicknessUm: 60 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer", "vacuum-gas-flush"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2], zipper: true, transparency: "opaque",
    notes: "High moisture and oxygen barrier, light protection.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pet-al-pe", name: "PET 12 / Al foil 9 / LDPE 75 pouch",
    layers: [{ materialId: "PET", thicknessUm: 12 }, { materialId: "AL", thicknessUm: 9 }, { materialId: "LDPE", thicknessUm: 75 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer", "vacuum-chamber", "vacuum-gas-flush"],
    suitableFor: ["dry", "wet-processed"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2, 5], zipper: true, transparency: "opaque",
    notes: "Near-total barrier while free of flex cracks; not recyclable in common streams.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pa-pe-vac", name: "BOPA 15 / LDPE 70 vacuum pouch",
    layers: [{ materialId: "BOPA", thicknessUm: 15 }, { materialId: "LDPE", thicknessUm: 70 }],
    format: "vacuum-pack", kind: "primary", sealMethods: ["vacuum-chamber", "vacuum-gas-flush", "heat-impulse"],
    suitableFor: ["dry", "chilled-perishable"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2, 5, 10], transparency: "clear",
    notes: "Puncture-resistant vacuum pouch; moderate oxygen barrier.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pa-evoh-pe", name: "BOPA 15 / PE-EVOH-PE 70 high-barrier vacuum pouch",
    layers: [{ materialId: "BOPA", thicknessUm: 15 }, { materialId: "LDPE", thicknessUm: 30 }, { materialId: "EVOH", thicknessUm: 5 }, { materialId: "LDPE", thicknessUm: 35 }],
    format: "vacuum-pack", kind: "primary", sealMethods: ["vacuum-chamber", "vacuum-gas-flush", "heat-impulse"],
    suitableFor: ["dry", "chilled-perishable"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2, 5, 10], transparency: "clear",
    notes: "High oxygen barrier with puncture resistance; used for vacuum / gas-flushed nuts.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pe-evoh-pe", name: "PE / EVOH 4 / PE 100 µm (mono-PE design)",
    layers: [{ materialId: "LDPE", thicknessUm: 40 }, { materialId: "EVOH", thicknessUm: 4 }, { materialId: "LLDPE", thicknessUm: 56 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer", "vacuum-gas-flush"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2, 5], zipper: true, transparency: "translucent",
    notes: "Designed for the PE recycling stream (EVOH ≤ 5% by weight is the usual design guideline) — recyclability depends on local collection.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "alox-pet-pe", name: "AlOx-PET 12 / LDPE 60 (transparent high barrier)",
    layers: [{ materialId: "ALOX-PET", thicknessUm: 12 }, { materialId: "LDPE", thicknessUm: 60 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer", "vacuum-gas-flush"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1, 2], zipper: true, transparency: "clear",
    notes: "Product visible; still exposed to light.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "kraft-metpet-pe", name: "Kraft paper / Met-PET 12 / LDPE 50",
    layers: [{ materialId: "KRAFT", thicknessUm: 75 }, { materialId: "MET-PET", thicknessUm: 12 }, { materialId: "LDPE", thicknessUm: 50 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1], zipper: true, transparency: "opaque",
    notes: "Paper look with metallised barrier; multi-material (not recyclable in paper stream).", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "cellulose-compost", name: "Coated cellulose 23 / compostable sealant 40",
    layers: [{ materialId: "CELLULOSE", thicknessUm: 23 }, { materialId: "COMPOST-SEAL", thicknessUm: 40 }],
    format: "stand-up-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [0.1, 0.25, 0.5, 1], transparency: "clear",
    notes: "Compostable only where suitable composting exists; barrier weakens at high humidity.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "bopp-30-antifog", name: "Anti-fog BOPP 30 µm produce bag (micro-perforatable)",
    layers: [{ materialId: "BOPP", thicknessUm: 30 }],
    format: "pillow-pouch", kind: "primary", sealMethods: ["heat-impulse", "band-sealer", "clip-tie"],
    suitableFor: ["fresh"], microperforatable: true, sizesKg: [0.25, 0.5, 1, 2], antiFog: true, transparency: "clear",
    notes: "Low-permeability film; needs laser micro-perforation sized to respiration.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "ldpe-25-antifog", name: "Anti-fog LDPE 25 µm produce bag",
    layers: [{ materialId: "LDPE", thicknessUm: 25 }],
    format: "pillow-pouch", kind: "primary", sealMethods: ["heat-impulse", "clip-tie"],
    suitableFor: ["fresh"], microperforatable: true, sizesKg: [0.5, 1, 2, 5], antiFog: true, transparency: "clear",
    notes: "Higher permeability film for moderate-respiration produce.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "ldpe-30-crate-liner", name: "LDPE 30 µm crate liner (MAP liner)",
    layers: [{ materialId: "LDPE", thicknessUm: 30 }],
    format: "crate", kind: "bulk-liner", sealMethods: ["clip-tie", "heat-impulse"],
    suitableFor: ["fresh"], microperforatable: true, sizesKg: [5, 10, 20], antiFog: true, transparency: "clear",
    notes: "Liner inside a ventilated crate or carton for bulk produce.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "open-crate", name: "Ventilated plastic crate (no liner)",
    layers: [], format: "crate", kind: "rigid", sealMethods: ["none"],
    suitableFor: ["fresh"], microperforatable: false, sizesKg: [10, 20],
    rigid: { otrPerPackCcDay: 1e9, wvtrPerPackGDay: 1e6, massG: 1800, refSizeKg: 20, family: "PP" },
    transparency: "clear", notes: "Direct crate packing: no modified atmosphere; relies on temperature control and short transit.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "tin-can", name: "Tinplate can, vacuum or CO₂/N₂ flushed",
    layers: [], format: "tin", kind: "rigid", sealMethods: ["can-seamer"],
    suitableFor: ["dry"], microperforatable: false, sizesKg: [1, 5, 11.34],
    rigid: { otrPerPackCcDay: 0.001, wvtrPerPackGDay: 0.0005, massG: 180, refSizeKg: 1, family: "metal" },
    transparency: "opaque", notes: "Traditional export format for cashew kernels (e.g. 25 lb tins). Needs a can seamer or packing service.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "glass-jar", name: "Glass jar with lug cap",
    layers: [], format: "jar", kind: "rigid", sealMethods: ["screw-cap"],
    suitableFor: ["wet-processed", "dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1],
    rigid: { otrPerPackCcDay: 0.02, wvtrPerPackGDay: 0.01, massG: 250, refSizeKg: 0.5, family: "glass" },
    transparency: "clear", notes: "Barrier limited by the closure; heavy and breakable.", sourceId: "POLYMER-HANDBOOK"
  },
  {
    id: "pet-jar", name: "PET jar with screw cap",
    layers: [], format: "jar", kind: "rigid", sealMethods: ["screw-cap"],
    suitableFor: ["wet-processed", "dry"], microperforatable: false, sizesKg: [0.25, 0.5, 1],
    rigid: { otrPerPackCcDay: 0.25, wvtrPerPackGDay: 0.05, massG: 35, refSizeKg: 0.5, family: "PET" },
    transparency: "clear", notes: "Light, shatter-resistant; oxygen barrier lower than glass.", sourceId: "POLYMER-HANDBOOK"
  }
];

export const COMMON_GAUGES_UM = [20, 25, 30, 38, 50, 63, 75, 90, 100, 125, 150, 200];

export function getStructure(id: string): Structure {
  const s = STRUCTURES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown structure ${id}`);
  return s;
}

/** Everyday names a farmer or shopkeeper would recognise (shown before the technical name). */
export const PLAIN_NAMES: Record<string, string> = {
  "ldpe-50": "Plain clear plastic (polythene) pouch",
  "ldpe-100-liner": "Thick polythene liner bag inside a carton or sack",
  "woven-ldpe-liner": "Woven sack (like rice/sugar sacks) with a polythene bag inside",
  "bopp-cpp": "Clear glossy snack/biscuit wrapper",
  "bopp-metbopp": "Shiny silver snack packet (chips-type packet)",
  "pet-pe": "Clear printed stand-up zip pouch",
  "pet-metpet-pe": "Stand-up zip pouch, silver inside",
  "pet-al-pe": "Foil-lined pouch (aluminium layer inside)",
  "pa-pe-vac": "Clear vacuum-sealed pack (skin-tight, like packed paneer)",
  "pa-evoh-pe": "Clear vacuum-sealed pack with extra oxygen barrier",
  "pe-evoh-pe": "Recyclable-design polythene zip pouch with a thin oxygen-barrier layer",
  "alox-pet-pe": "See-through high-barrier zip pouch",
  "kraft-metpet-pe": "Brown paper-look zip pouch, silver inside",
  "cellulose-compost": "Compostable (plant-based) clear pouch",
  "bopp-30-antifog": "Clear fog-free vegetable bag with tiny laser holes",
  "ldpe-25-antifog": "Thin clear vegetable bag (fog-free) with tiny holes",
  "ldpe-30-crate-liner": "Plastic liner sheet inside a vegetable crate",
  "open-crate": "Open plastic vegetable crate",
  "tin-can": "Sealed metal tin",
  "glass-jar": "Glass jar with metal cap",
  "pet-jar": "Clear plastic jar with screw cap"
};
export const plainName = (id: string) => PLAIN_NAMES[id] ?? getStructure(id).name;
