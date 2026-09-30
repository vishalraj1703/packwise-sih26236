import type { Commodity, Evidenced } from "../types";

const ref = (value: number, lo: number, hi: number, unit: string, sourceId: string, note?: string): Evidenced => ({
  value, lo, hi, unit, status: "reference", sourceId, note
});

// Seed commodity knowledge. Every number is a *reference estimate* with a
// range and a source. Values marked with the SEED source are illustrative and
// must be replaced by sourced isotherms / measurements after expert review.
export const COMMODITIES: Commodity[] = [
  {
    id: "cashew-kernel",
    name: "Cashew kernels",
    names: { ta: "முந்திரி பருப்பு", hi: "काजू" },
    aliases: ["cashew", "kaju", "munthiri", "cashew nut", "w240", "w320"],
    foodClass: "dry",
    states: ["unroasted", "roasted"],
    defaultState: "unroasted",
    icon: "🥜",
    bulkDensityKgPerL: 0.58,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(4.0, 3.0, 5.0, "% w.b.", "UNECE-DDP17", "Typical after drying; measure the actual batch."),
      criticalWb: ref(5.0, 5.0, 5.0, "% w.b.", "UNECE-DDP17", "UNECE DDP-17 maximum moisture for cashew kernels."),
      direction: "gain",
      isoA: ref(0.005, 0.0, 0.01, "g/g d.b.", "SEED", "Linearised isotherm intercept — illustrative; replace with a sourced isotherm."),
      isoB: ref(0.085, 0.06, 0.11, "g/g per aw", "SEED", "Linearised isotherm slope — illustrative; replace with a sourced isotherm."),
      isoRange: [0.2, 0.75],
      criticalReason: "Moisture above the UNECE limit softens kernels and raises mould risk."
    },
    oxygen: {
      tolerancePpm: ref(10, 5, 15, "mg O₂/kg", "SALAME", "Class value for nuts & snacks."),
      reason: "High fat content (~45%) — oxygen drives rancidity."
    },
    lightSensitive: true,
    mechanical: { fragility: "medium", sharpEdges: false, crushable: false },
    insectRisk: true,
    storageAdvice: "Cool, dry, dark place; keep away from strong odours.",
    commercialExample: {
      format: "Nitrogen-flushed stand-up pouch or vacuum/CO₂-flushed tin (packaging-format example)",
      illustration: "tin",
      explanation: "Nuts sold for long storage are commonly packed in hermetic containers with reduced oxygen because their fat oxidises. Your kernels have the same need, but your drying, sealing and storage may differ, so that product's shelf life does not transfer to yours."
    },
    notes: ["Broken pieces oxidise faster than wholes (larger surface).", "Roasting increases oxidation rate — treat roasted kernels as more oxygen-sensitive."]
  },
  {
    id: "instant-noodles",
    name: "Instant noodles (fried noodle cakes)",
    names: { ta: "இன்ஸ்டன்ட் நூடுல்ஸ்", hi: "इंस्टेंट नूडल्स" },
    aliases: ["noodles", "instant noodles", "maggi", "ramen", "nudulz", "नूडल्स", "நூடுல்ஸ்"],
    foodClass: "dry",
    states: ["fried", "dried"],
    defaultState: "fried",
    icon: "🍜",
    bulkDensityKgPerL: 0.3,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(4.0, 2.5, 6.0, "% w.b.", "SEED", "Typical for fried noodle cakes — measure your batch."),
      criticalWb: ref(10.0, 10.0, 10.0, "% w.b.", "CODEX-249", "Codex standard maximum moisture for fried instant noodles."),
      direction: "gain",
      isoA: ref(0.01, 0.0, 0.02, "g/g d.b.", "SEED"),
      isoB: ref(0.12, 0.09, 0.15, "g/g per aw", "SEED"),
      isoRange: [0.2, 0.85],
      criticalReason: "Above the Codex moisture limit texture and microbial stability suffer."
    },
    oxygen: { tolerancePpm: ref(10, 5, 15, "mg O₂/kg", "SALAME", "Class value for fried snacks."), reason: "Frying oil in the noodle cake turns rancid with oxygen." },
    lightSensitive: true,
    mechanical: { fragility: "high", sharpEdges: false, crushable: true },
    insectRisk: true,
    storageAdvice: "Cool, dry place away from sunlight; do not crush the packets.",
    commercialExample: {
      format: "Printed pillow packet (like instant-noodle packets in shops)",
      illustration: "pillow-pouch",
      explanation: "Instant noodles in shops come in sealed printed pillow packets. Your noodle cakes have the same need to stay dry and away from air, but your oil, frying and sealing may differ, so their shelf life does not automatically apply to yours."
    },
    notes: [
      "Tastemaker/seasoning sachets are packed separately and have their own needs.",
      "The oxygen tolerance used here is a conservative textbook class value. Commercial noodles often use antioxidants in the frying oil and are sold in simple printed packs; a storage study (peroxide / acid value over time) can justify a higher tolerance for your recipe."
    ]
  },
  {
    id: "groundnut-kernel",
    name: "Groundnut (peanut) kernels",
    names: { ta: "வேர்க்கடலை", hi: "मूंगफली दाना" },
    aliases: ["peanut", "groundnut", "moongphali", "verkadalai"],
    foodClass: "dry",
    states: ["unroasted", "roasted"],
    defaultState: "unroasted",
    icon: "🥜",
    bulkDensityKgPerL: 0.62,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(6.0, 5.0, 7.0, "% w.b.", "SEED"),
      criticalWb: ref(7.5, 7.0, 8.0, "% w.b.", "SEED", "Keeping water activity below ~0.70 limits mould growth and aflatoxin risk."),
      direction: "gain",
      isoA: ref(0.01, 0.0, 0.02, "g/g d.b.", "SEED"),
      isoB: ref(0.10, 0.08, 0.13, "g/g per aw", "SEED"),
      isoRange: [0.2, 0.8],
      criticalReason: "Mould growth and aflatoxin risk rise above aw ≈ 0.70."
    },
    oxygen: { tolerancePpm: ref(10, 5, 15, "mg O₂/kg", "SALAME", "Class value for nuts & snacks."), reason: "High oil content — oxidative rancidity." },
    lightSensitive: true,
    mechanical: { fragility: "low", sharpEdges: false, crushable: false },
    insectRisk: true,
    storageAdvice: "Dry, cool, ventilated store; aflatoxin testing where required by the buyer.",
    notes: ["Aflatoxin risk is a safety issue — packaging cannot fix contaminated lots."]
  },
  {
    id: "rice-raw",
    name: "Rice (raw, milled)",
    names: { ta: "அரிசி", hi: "चावल" },
    aliases: ["rice", "arisi", "chawal", "ponni", "sona masoori"],
    foodClass: "dry",
    states: ["milled"],
    defaultState: "milled",
    icon: "🍚",
    bulkDensityKgPerL: 0.8,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(12.5, 11.5, 13.5, "% w.b.", "SEED"),
      criticalWb: ref(14.0, 13.5, 14.5, "% w.b.", "SEED", "Commonly used safe-storage moisture for milled rice."),
      direction: "gain",
      isoA: ref(0.028, 0.02, 0.035, "g/g d.b.", "SEED"),
      isoB: ref(0.17, 0.14, 0.2, "g/g per aw", "SEED"),
      isoRange: [0.4, 0.85],
      criticalReason: "Above ~14% moisture, mould and insect activity increase."
    },
    lightSensitive: false,
    mechanical: { fragility: "low", sharpEdges: false, crushable: false },
    insectRisk: true,
    storageAdvice: "Dry store on pallets off the floor; hermetic bags suppress insects.",
    commercialExample: { format: "Woven sack with liner / printed PE retail bag (packaging-format example)", illustration: "sack-liner", explanation: "Grain is usually protected against moisture pick-up and insects rather than oxygen." },
    notes: []
  },
  {
    id: "wheat-flour",
    name: "Wheat flour (atta)",
    names: { ta: "கோதுமை மாவு", hi: "गेहूं का आटा" },
    aliases: ["atta", "wheat flour", "godhumai maavu"],
    foodClass: "dry",
    states: ["milled"],
    defaultState: "milled",
    icon: "🌾",
    bulkDensityKgPerL: 0.55,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(12.0, 11.0, 13.0, "% w.b.", "SEED"),
      criticalWb: ref(14.0, 13.5, 14.5, "% w.b.", "SEED"),
      direction: "gain",
      isoA: ref(0.03, 0.02, 0.04, "g/g d.b.", "SEED"),
      isoB: ref(0.17, 0.14, 0.2, "g/g per aw", "SEED"),
      isoRange: [0.4, 0.85],
      criticalReason: "Caking, mould and insect growth increase with moisture."
    },
    lightSensitive: false,
    mechanical: { fragility: "low", sharpEdges: false, crushable: false },
    insectRisk: true,
    storageAdvice: "Dry, cool store; first-in first-out (whole-wheat flour develops rancidity through enzyme action).",
    notes: ["Rancidity in whole-wheat flour is largely enzymatic — oxygen barrier alone does not prevent it."]
  },
  {
    id: "turmeric-powder",
    name: "Turmeric powder",
    names: { ta: "மஞ்சள் தூள்", hi: "हल्दी पाउडर" },
    aliases: ["turmeric", "manjal", "haldi"],
    foodClass: "dry",
    states: ["milled"],
    defaultState: "milled",
    icon: "🟡",
    bulkDensityKgPerL: 0.55,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(8.0, 7.0, 9.0, "% w.b.", "SEED"),
      criticalWb: ref(10.0, 10.0, 10.0, "% w.b.", "SEED", "Commonly cited regulatory moisture limit for turmeric powder — verify the current FSSAI standard."),
      direction: "gain",
      isoA: ref(0.02, 0.01, 0.03, "g/g d.b.", "SEED"),
      isoB: ref(0.13, 0.1, 0.16, "g/g per aw", "SEED"),
      isoRange: [0.3, 0.8],
      criticalReason: "Caking and mould above the moisture limit."
    },
    lightSensitive: true,
    mechanical: { fragility: "low", sharpEdges: false, crushable: false },
    insectRisk: true,
    storageAdvice: "Dark, dry storage — curcumin colour fades in light.",
    notes: ["Aroma loss is also a quality factor; aroma barrier is not modelled in this prototype."]
  },
  {
    id: "banana-chips",
    name: "Banana chips (fried)",
    names: { ta: "வாழைக்காய் சிப்ஸ்", hi: "केले के चिप्स" },
    aliases: ["banana chips", "chips", "nendran chips", "vazhakkai chips"],
    foodClass: "dry",
    states: ["fried"],
    defaultState: "fried",
    icon: "🍌",
    bulkDensityKgPerL: 0.25,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(2.5, 2.0, 3.0, "% w.b.", "SEED"),
      criticalWb: ref(4.0, 3.5, 4.5, "% w.b.", "SEED", "Approximate moisture at which crispness is lost."),
      direction: "gain",
      isoA: ref(0.0, 0.0, 0.005, "g/g d.b.", "SEED"),
      isoB: ref(0.09, 0.07, 0.11, "g/g per aw", "SEED"),
      isoRange: [0.1, 0.6],
      criticalReason: "Loss of crispness."
    },
    oxygen: { tolerancePpm: ref(10, 5, 15, "mg O₂/kg", "SALAME", "Class value for nuts & snacks."), reason: "Frying oil oxidises (rancid flavour)." },
    lightSensitive: true,
    mechanical: { fragility: "high", sharpEdges: false, crushable: true },
    insectRisk: false,
    storageAdvice: "Cool, dark; avoid crushing loads.",
    commercialExample: {
      format: "Metallised pillow pouch, often nitrogen-flushed (packaging-format example)",
      illustration: "pillow-pouch",
      explanation: "This familiar dry snack format protects against moisture and light and the gas cushion reduces breakage. Your chips also need moisture protection to stay crisp, but your oil, frying and sealing may differ, so that product's shelf life does not automatically apply to yours."
    },
    notes: []
  },
  {
    id: "jaggery",
    name: "Jaggery (blocks)",
    names: { ta: "வெல்லம்", hi: "गुड़" },
    aliases: ["jaggery", "vellam", "gur", "gud"],
    foodClass: "dry",
    states: ["processed"],
    defaultState: "processed",
    icon: "🟫",
    bulkDensityKgPerL: 0.8,
    review: "unreviewed-seed",
    moisture: {
      initialWb: ref(7.0, 6.0, 8.0, "% w.b.", "SEED"),
      criticalWb: ref(10.0, 9.0, 11.0, "% w.b.", "SEED"),
      direction: "gain",
      isoA: ref(-0.05, -0.07, -0.03, "g/g d.b.", "SEED"),
      isoB: ref(0.25, 0.2, 0.3, "g/g per aw", "SEED"),
      isoRange: [0.45, 0.7],
      criticalReason: "Very hygroscopic: surface wetting, stickiness and microbial growth."
    },
    lightSensitive: false,
    mechanical: { fragility: "low", sharpEdges: false, crushable: false },
    insectRisk: false,
    storageAdvice: "Keep sealed; sugar isotherms are strongly non-linear, so the linear model applies only in a narrow range.",
    notes: ["Linear isotherm applicability is narrow — expect wider uncertainty."]
  },
  {
    id: "tomato",
    name: "Tomato (mature green / breaker)",
    names: { ta: "தக்காளி", hi: "टमाटर" },
    aliases: ["tomato", "thakkali", "tamatar"],
    foodClass: "fresh",
    states: ["fresh-whole"],
    defaultState: "fresh-whole",
    icon: "🍅",
    bulkDensityKgPerL: 0.55,
    review: "unreviewed-seed",
    respiration: {
      rco2At20: ref(25, 15, 35, "mg CO₂/kg·h", "SEED", "Order of magnitude consistent with USDA HB66 ranges — verify for cultivar and maturity."),
      q10: ref(2.3, 2.0, 2.6, "–", "SEED"),
      rq: ref(1.0, 0.9, 1.1, "–", "SEED"),
      kmO2: ref(0.03, 0.02, 0.05, "O₂ fraction", "SEED"),
      targetO2: [0.03, 0.05],
      targetCo2: [0.02, 0.03],
      minO2: 0.02,
      maxCo2: 0.05,
      storageTempC: [12, 15],
      chillingInjuryBelowC: 10,
      ethyleneProducer: true,
      ethyleneSensitive: true,
      maxStorageDaysAtOptimum: [7, 21],
      sourceIdGas: "KADER"
    },
    lightSensitive: false,
    mechanical: { fragility: "high", sharpEdges: false, crushable: true },
    insectRisk: false,
    storageAdvice: "12–15 °C for mature-green fruit; below ~10 °C risks chilling injury.",
    commercialExample: { format: "Ventilated plastic crate, single or double layer (packaging-format example)", illustration: "crate", explanation: "Short-haul tomatoes usually travel in ventilated crates; film packs need sizing to respiration." },
    notes: ["Do not pack with ethylene-sensitive produce."]
  },
  {
    id: "mango",
    name: "Mango (mature, unripe)",
    names: { ta: "மாம்பழம்", hi: "आम" },
    aliases: ["mango", "maampazham", "aam", "alphonso", "banganapalli"],
    foodClass: "fresh",
    states: ["fresh-whole"],
    defaultState: "fresh-whole",
    icon: "🥭",
    bulkDensityKgPerL: 0.55,
    review: "unreviewed-seed",
    respiration: {
      rco2At20: ref(60, 40, 80, "mg CO₂/kg·h", "SEED", "Climacteric — rate rises sharply during ripening."),
      q10: ref(2.2, 2.0, 2.5, "–", "SEED"),
      rq: ref(1.0, 0.9, 1.2, "–", "SEED"),
      kmO2: ref(0.03, 0.02, 0.05, "O₂ fraction", "SEED"),
      targetO2: [0.03, 0.05],
      targetCo2: [0.05, 0.08],
      minO2: 0.02,
      maxCo2: 0.1,
      storageTempC: [12, 13],
      chillingInjuryBelowC: 12,
      ethyleneProducer: true,
      ethyleneSensitive: true,
      maxStorageDaysAtOptimum: [14, 21],
      sourceIdGas: "KADER"
    },
    lightSensitive: false,
    mechanical: { fragility: "medium", sharpEdges: false, crushable: true },
    insectRisk: false,
    storageAdvice: "12–13 °C; avoid sap burn by de-sapping before packing.",
    notes: []
  },
  {
    id: "banana",
    name: "Banana (mature green)",
    names: { ta: "வாழைப்பழம்", hi: "केला" },
    aliases: ["banana", "vazhaipazham", "kela", "robusta", "poovan"],
    foodClass: "fresh",
    states: ["fresh-whole"],
    defaultState: "fresh-whole",
    icon: "🍌",
    bulkDensityKgPerL: 0.5,
    review: "unreviewed-seed",
    respiration: {
      rco2At20: ref(30, 20, 45, "mg CO₂/kg·h", "SEED", "Pre-climacteric fruit; much higher once ripening starts."),
      q10: ref(2.2, 2.0, 2.5, "–", "SEED"),
      rq: ref(1.0, 0.9, 1.1, "–", "SEED"),
      kmO2: ref(0.03, 0.02, 0.05, "O₂ fraction", "SEED"),
      targetO2: [0.02, 0.05],
      targetCo2: [0.02, 0.05],
      minO2: 0.015,
      maxCo2: 0.07,
      storageTempC: [13, 14],
      chillingInjuryBelowC: 13,
      ethyleneProducer: true,
      ethyleneSensitive: true,
      maxStorageDaysAtOptimum: [14, 28],
      sourceIdGas: "KADER"
    },
    lightSensitive: false,
    mechanical: { fragility: "high", sharpEdges: false, crushable: true },
    insectRisk: false,
    storageAdvice: "13–14 °C; bruises easily — pad hands and avoid stacking loose fruit.",
    notes: []
  },
  {
    id: "spinach",
    name: "Spinach (leaves)",
    names: { ta: "பசலைக் கீரை", hi: "पालक" },
    aliases: ["spinach", "palak", "keerai"],
    foodClass: "fresh",
    states: ["fresh-whole", "fresh-cut"],
    defaultState: "fresh-whole",
    icon: "🥬",
    bulkDensityKgPerL: 0.15,
    review: "unreviewed-seed",
    respiration: {
      rco2At20: ref(130, 80, 200, "mg CO₂/kg·h", "SEED", "Very high respiration leafy vegetable."),
      q10: ref(3.0, 2.5, 3.5, "–", "SEED"),
      rq: ref(1.0, 0.9, 1.1, "–", "SEED"),
      kmO2: ref(0.03, 0.02, 0.05, "O₂ fraction", "SEED"),
      targetO2: [0.07, 0.1],
      targetCo2: [0.05, 0.1],
      minO2: 0.02,
      maxCo2: 0.12,
      storageTempC: [0, 2],
      ethyleneProducer: false,
      ethyleneSensitive: true,
      maxStorageDaysAtOptimum: [10, 14],
      sourceIdGas: "KADER"
    },
    lightSensitive: false,
    mechanical: { fragility: "high", sharpEdges: false, crushable: true },
    insectRisk: false,
    storageAdvice: "0–2 °C with high humidity; without refrigeration, market the same day.",
    notes: []
  },
  {
    id: "mango-pickle",
    name: "Mango pickle (oil-based)",
    names: { ta: "மாங்காய் ஊறுகாய்", hi: "आम का अचार" },
    aliases: ["pickle", "oorugai", "achar"],
    foodClass: "wet-processed",
    states: ["processed"],
    defaultState: "processed",
    icon: "🫙",
    bulkDensityKgPerL: 1.0,
    review: "unreviewed-seed",
    requiredMeasurements: [
      { key: "ph", label: "Equilibrium pH", why: "Acidity decides which spoilage and safety risks the pack must address; pH ≤ 4.6 is a widely used boundary for acidified foods.", howToMeasure: "Blend a representative sample and measure with a calibrated pH meter (two-point calibration). Paper strips are not adequate." },
      { key: "salt", label: "Salt content (%)", why: "Salt and acidity together control microbial growth.", howToMeasure: "Titration (Mohr method) in a food lab." },
      { key: "oilCover", label: "Free oil layer present after packing?", why: "An oil cap limits oxygen and surface mould.", howToMeasure: "Visual check after 24 h standing." }
    ],
    lightSensitive: true,
    mechanical: { fragility: "low", sharpEdges: false, crushable: false },
    insectRisk: false,
    storageAdvice: "Clean, dry utensils; keep closed and away from sunlight.",
    notes: ["Oil and acid require food-contact materials declared suitable for fatty/acidic foods."]
  },
  {
    id: "paneer",
    name: "Paneer (fresh)",
    names: { ta: "பனீர்", hi: "पनीर" },
    aliases: ["paneer", "cottage cheese"],
    foodClass: "chilled-perishable",
    states: ["processed"],
    defaultState: "processed",
    icon: "🧀",
    bulkDensityKgPerL: 0.9,
    review: "unreviewed-seed",
    requiredMeasurements: [
      { key: "micro", label: "Microbial shelf-life study (TPC, coliforms, yeast & mould over time)", why: "Shelf life of a chilled dairy product is set by microbial growth, which packaging only slows. A claim needs a storage study on the actual product.", howToMeasure: "NABL-accredited food lab: storage study at the intended temperature." },
      { key: "ph", label: "pH", why: "Affects growth of spoilage organisms.", howToMeasure: "Calibrated pH meter." }
    ],
    lightSensitive: false,
    mechanical: { fragility: "medium", sharpEdges: false, crushable: true },
    insectRisk: false,
    storageAdvice: "Keep at ≤ 4 °C continuously — cold chain is mandatory.",
    notes: ["Packaging (e.g. vacuum) can be recommended for the cold chain, but no shelf-life figure is given without a storage study."]
  }
];

export function getCommodity(id: string): Commodity {
  const c = COMMODITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown commodity ${id}`);
  return c;
}

export function searchCommodities(q: string): Commodity[] {
  const s = q.trim().toLowerCase();
  if (!s) return COMMODITIES;
  return COMMODITIES.filter(
    (c) => c.name.toLowerCase().includes(s) || c.aliases.some((a) => a.includes(s) || s.includes(a)) || Object.values(c.names).some((n) => n && n.includes(q.trim()))
  );
}
