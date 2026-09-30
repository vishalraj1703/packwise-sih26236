import type { Supplier, SupplierProduct } from "../types";
import { MATERIALS, STRUCTURES } from "./materials";
import { pouchGeometry, filmMassG } from "../engine/geometry";
import { structureAtTest } from "../engine/barrier";

// ALL SUPPLIER DATA BELOW IS SIMULATED (source "SIM"). Names are deliberately
// generic ("Demo …") so that no real company, price or endorsement is implied.
export const SUPPLIERS: Supplier[] = [
  { id: "sup-flex-chennai", name: "Demo Flexibles (Chennai)", city: "Chennai", lat: 13.08, lon: 80.27, deliversTo: ["Tamil Nadu", "Puducherry", "Karnataka", "Kerala", "Andhra Pradesh"], simulated: true, services: ["material"], contactNote: "Quotation workflow only (simulated)." },
  { id: "sup-barrier-cbe", name: "Demo Barrier Packaging (Coimbatore)", city: "Coimbatore", lat: 11.02, lon: 76.96, deliversTo: ["all-india"], simulated: true, services: ["material"], contactNote: "Provides third-party OTR/WVTR reports (simulated)." },
  { id: "sup-agri-cuddalore", name: "Demo Agri-Pack Store (Cuddalore)", city: "Cuddalore", lat: 11.75, lon: 79.75, deliversTo: ["Tamil Nadu", "Puducherry"], simulated: true, services: ["material"], contactNote: "Small quantities, stock items (simulated)." },
  { id: "sup-green-blr", name: "Demo Green Packaging (Bengaluru)", city: "Bengaluru", lat: 12.97, lon: 77.59, deliversTo: ["all-india"], simulated: true, services: ["material"], contactNote: "Compostable & recyclable-design films (simulated)." },
  { id: "sup-rigid-chennai", name: "Demo Rigid Containers (Chennai)", city: "Chennai", lat: 13.1, lon: 80.2, deliversTo: ["Tamil Nadu", "Puducherry", "Andhra Pradesh"], simulated: true, services: ["material"], contactNote: "Tins and jars (simulated)." },
  { id: "sup-freshfilm-pune", name: "Demo Fresh-Pack Films (Pune)", city: "Pune", lat: 18.52, lon: 73.86, deliversTo: ["all-india"], simulated: true, services: ["material"], contactNote: "Anti-fog films with laser micro-perforation to specification (simulated)." },
  {
    id: "svc-pack-panruti", name: "Demo Packing Service (Panruti)", city: "Panruti", lat: 11.78, lon: 79.55, deliversTo: ["Tamil Nadu", "Puducherry"], simulated: true, services: ["packing-service"],
    packingService: { methods: ["band-sealer", "vacuum-chamber", "vacuum-gas-flush", "can-seamer"], pricePerPackInr: 4, minChargeInr: 500, city: "Panruti" },
    contactNote: "Vacuum, nitrogen flushing and can seaming by the pack (simulated)."
  },
  {
    id: "svc-incubator-chennai", name: "Demo Food Processing Incubator (Chennai)", city: "Chennai", lat: 12.99, lon: 80.22, deliversTo: ["Tamil Nadu"], simulated: true, services: ["packing-service"],
    packingService: { methods: ["band-sealer", "vacuum-gas-flush", "tray-sealer"], pricePerPackInr: 6, minChargeInr: 800, city: "Chennai" },
    contactNote: "Shared facility, bookable by the hour (simulated)."
  }
];

type Offer = { supplierId: string; structureId: string; moq: number; setup: number; lead: number; doc: SupplierProduct["documentation"]; markup: number; };

const OFFERS: Offer[] = [
  { supplierId: "sup-flex-chennai", structureId: "ldpe-50", moq: 200, setup: 0, lead: 3, doc: "supplier-declared", markup: 2.2 },
  { supplierId: "sup-flex-chennai", structureId: "pet-pe", moq: 500, setup: 1500, lead: 7, doc: "supplier-declared", markup: 2.4 },
  { supplierId: "sup-flex-chennai", structureId: "pet-metpet-pe", moq: 500, setup: 1500, lead: 7, doc: "supplier-declared", markup: 2.4 },
  { supplierId: "sup-flex-chennai", structureId: "pet-al-pe", moq: 500, setup: 1500, lead: 7, doc: "supplier-declared", markup: 2.4 },
  { supplierId: "sup-flex-chennai", structureId: "bopp-cpp", moq: 1000, setup: 1500, lead: 7, doc: "supplier-declared", markup: 2.2 },
  { supplierId: "sup-flex-chennai", structureId: "bopp-metbopp", moq: 1000, setup: 1500, lead: 7, doc: "supplier-declared", markup: 2.2 },
  { supplierId: "sup-barrier-cbe", structureId: "pa-pe-vac", moq: 300, setup: 0, lead: 6, doc: "third-party-test-report", markup: 2.3 },
  { supplierId: "sup-barrier-cbe", structureId: "pa-evoh-pe", moq: 300, setup: 0, lead: 8, doc: "third-party-test-report", markup: 2.3 },
  { supplierId: "sup-barrier-cbe", structureId: "pe-evoh-pe", moq: 500, setup: 1200, lead: 10, doc: "third-party-test-report", markup: 2.4 },
  { supplierId: "sup-barrier-cbe", structureId: "alox-pet-pe", moq: 500, setup: 1200, lead: 10, doc: "third-party-test-report", markup: 2.3 },
  { supplierId: "sup-barrier-cbe", structureId: "pet-al-pe", moq: 1000, setup: 0, lead: 6, doc: "third-party-test-report", markup: 2.1 },
  { supplierId: "sup-agri-cuddalore", structureId: "ldpe-50", moq: 50, setup: 0, lead: 1, doc: "none", markup: 2.8 },
  { supplierId: "sup-agri-cuddalore", structureId: "ldpe-100-liner", moq: 10, setup: 0, lead: 1, doc: "none", markup: 2.6 },
  { supplierId: "sup-agri-cuddalore", structureId: "woven-ldpe-liner", moq: 10, setup: 0, lead: 1, doc: "none", markup: 2.6 },
  { supplierId: "sup-agri-cuddalore", structureId: "ldpe-25-antifog", moq: 100, setup: 0, lead: 2, doc: "none", markup: 2.8 },
  { supplierId: "sup-agri-cuddalore", structureId: "ldpe-30-crate-liner", moq: 20, setup: 0, lead: 2, doc: "none", markup: 2.6 },
  { supplierId: "sup-agri-cuddalore", structureId: "open-crate", moq: 1, setup: 0, lead: 1, doc: "none", markup: 1 },
  { supplierId: "sup-green-blr", structureId: "cellulose-compost", moq: 500, setup: 2000, lead: 12, doc: "third-party-test-report", markup: 2.0 },
  { supplierId: "sup-green-blr", structureId: "pe-evoh-pe", moq: 1000, setup: 1500, lead: 12, doc: "third-party-test-report", markup: 2.2 },
  { supplierId: "sup-green-blr", structureId: "kraft-metpet-pe", moq: 500, setup: 1500, lead: 10, doc: "supplier-declared", markup: 2.2 },
  { supplierId: "sup-rigid-chennai", structureId: "tin-can", moq: 20, setup: 0, lead: 4, doc: "supplier-declared", markup: 1 },
  { supplierId: "sup-rigid-chennai", structureId: "glass-jar", moq: 50, setup: 0, lead: 3, doc: "supplier-declared", markup: 1 },
  { supplierId: "sup-rigid-chennai", structureId: "pet-jar", moq: 100, setup: 0, lead: 3, doc: "supplier-declared", markup: 1 },
  { supplierId: "sup-freshfilm-pune", structureId: "bopp-30-antifog", moq: 2000, setup: 2500, lead: 14, doc: "third-party-test-report", markup: 2.4 },
  { supplierId: "sup-freshfilm-pune", structureId: "ldpe-25-antifog", moq: 1000, setup: 1500, lead: 12, doc: "third-party-test-report", markup: 2.2 },
  { supplierId: "sup-freshfilm-pune", structureId: "ldpe-30-crate-liner", moq: 500, setup: 1500, lead: 12, doc: "third-party-test-report", markup: 2.2 }
];

// Fixed indicative per-unit prices for rigid containers at their reference size (simulated).
const RIGID_PRICE_AT_REF: Record<string, number> = { "tin-can": 55, "glass-jar": 18, "pet-jar": 9, "open-crate": 25 };

function unitPrice(structureId: string, sizeKg: number, markup: number, supplierId: string): number {
  const s = STRUCTURES.find((x) => x.id === structureId)!;
  // deterministic ±8% supplier variation
  const jitter = 1 + (((supplierId.length * 7 + structureId.length * 13) % 17) - 8) / 100;
  if (s.rigid) {
    const ref = RIGID_PRICE_AT_REF[structureId] ?? 20;
    return Math.round(ref * Math.pow(sizeKg / s.rigid.refSizeKg, 0.6) * jitter * 100) / 100;
  }
  const g = pouchGeometry(sizeKg, 0.6);
  const mass = filmMassG(s, g, (id) => MATERIALS[id].densityGcc);
  const matCost = s.layers.reduce((a, l) => {
    const m = MATERIALS[l.materialId];
    const share = (l.thicknessUm * m.densityGcc) / s.layers.reduce((x, y) => x + y.thicknessUm * MATERIALS[y.materialId].densityGcc, 0);
    return a + share * ((m.pricePerKgInr[0] + m.pricePerKgInr[1]) / 2);
  }, 0);
  const conversion = s.format === "stand-up-pouch" ? 1.35 : 1;
  const zip = s.zipper ? 0.8 : 0;
  return Math.round(((mass / 1000) * matCost * markup * conversion * jitter + zip + 0.3) * 100) / 100;
}

export const SUPPLIER_PRODUCTS: SupplierProduct[] = OFFERS.map((o, i) => {
  const s = STRUCTURES.find((x) => x.id === o.structureId)!;
  const prices: Record<string, number> = {};
  for (const size of s.sizesKg) prices[String(size)] = unitPrice(o.structureId, size, o.markup, o.supplierId);
  return {
    id: `sp-${i + 1}`,
    supplierId: o.supplierId,
    structureId: o.structureId,
    sizesKg: s.sizesKg,
    unitPriceInr: prices,
    moqUnits: o.moq,
    setupCostInr: o.setup,
    leadTimeDays: o.lead,
    documentation: o.doc,
    declared: {
      ...(o.doc !== "none" && !s.rigid ? declaredValues(o.structureId, o.supplierId) : {}),
      testConditions: o.doc === "none" ? "No documentation provided" : "OTR 23 °C / 0% RH (ASTM D3985); WVTR 38 °C / 90% RH (ASTM F1249)", reportDate: o.doc === "third-party-test-report" ? "2026-06-15" : undefined },
    materialLotPrefix: `${o.supplierId.split("-")[1].toUpperCase().slice(0, 4)}${i + 1}`
  };
});

// Supplier-documented values differ from generic literature values (simulated ±10–25%).
function declaredValues(structureId: string, supplierId: string) {
  const s = STRUCTURES.find((x) => x.id === structureId)!;
  const at = structureAtTest(s);
  const f = 1 + (((supplierId.length * 3 + structureId.length * 5) % 15) + 5) / 100; // 1.05–1.19: declared slightly worse than generic
  const r = (x: number) => (x >= 10 ? Math.round(x) : Math.round(x * 100) / 100);
  return { otr: r(at.otr * f), wvtr: r(at.wvtr * f) };
}

export const ABSORBER_PRICE_INR: Record<number, number> = { 20: 2.5, 30: 3, 50: 3.5, 100: 5, 200: 7, 300: 9, 500: 12, 1000: 18, 2000: 30 };

export function getSupplier(id: string) {
  return SUPPLIERS.find((s) => s.id === id)!;
}
