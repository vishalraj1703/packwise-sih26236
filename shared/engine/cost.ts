// Order-level cost model (discussion record p.5):
// Total = material + setup/minimum-order effects + sealing/flushing consumables
//       + labour + equipment or packing-service charges + outer packaging
//       + delivery (materials and goods) + applicable taxes.
// Every line states whether it is a quotation or an estimate, and its date.
import { SUPPLIER_PRODUCTS, SUPPLIERS, getSupplier } from "../data/suppliers";
import { haversineKm, type TransportOption, type Place } from "./journey";

export interface CostLine {
  group: "material" | "setup" | "consumables" | "labour" | "service" | "outer" | "delivery" | "transport" | "tax";
  label: string;
  amountInr: number;
  basis: "simulated-quote" | "estimate" | "user";
  detail: string;
}

export interface CostItem {
  portionId: string;
  supplierProductId: string | null;
  sizeKey: string;
  units: number;
  consumablesInr: number;
  consumablesDetail: string;
  labourMinutes: number;
  serviceId: string | null;
  outerInr: number;
  outerDetail: string;
  kg: number;
}

export interface CostSettings {
  gstPackagingPct: number;
  gstTransportPct: number;
  labourInrPerHour: number;
  quoteDate: string;
}

export const DEFAULT_COST_SETTINGS: CostSettings = { gstPackagingPct: 18, gstTransportPct: 5, labourInrPerHour: 60, quoteDate: "2026-09-30" };

export function aggregateOrderCost(items: CostItem[], transport: TransportOption, origin: Place, settings: CostSettings = DEFAULT_COST_SETTINGS) {
  const lines: CostLine[] = [];
  // group material purchases by supplier product so MOQ and setup apply once per product
  const byProduct = new Map<string, { units: Record<string, number>; portions: string[] }>();
  for (const it of items) {
    if (!it.supplierProductId) continue;
    const g = byProduct.get(it.supplierProductId) ?? { units: {}, portions: [] };
    g.units[it.sizeKey] = (g.units[it.sizeKey] ?? 0) + it.units;
    g.portions.push(it.portionId);
    byProduct.set(it.supplierProductId, g);
  }
  const suppliersUsed = new Set<string>();
  let materialTotal = 0;
  for (const [pid, g] of byProduct) {
    const p = SUPPLIER_PRODUCTS.find((x) => x.id === pid)!;
    const sup = getSupplier(p.supplierId);
    suppliersUsed.add(sup.id);
    const totalUnits = Object.values(g.units).reduce((a, b) => a + b, 0);
    // MOQ applies to the product line; extra units are bought at the cheapest listed size first.
    // MOQ top-up units are bought at the cheapest listed size in this order line.
    const extra = Math.max(0, p.moqUnits - totalUnits);
    const cheapestSize = Object.keys(g.units).sort((a, b) => p.unitPriceInr[a] - p.unitPriceInr[b] || Number(a) - Number(b))[0];
    for (const [size, u] of Object.entries(g.units)) {
      const buy = u + (size === cheapestSize ? extra : 0);
      const amt = buy * p.unitPriceInr[size];
      materialTotal += amt;
      lines.push({
        group: "material",
        label: `${sup.name}: ${buy} × ${size} kg pack${buy > u ? ` (incl. ${buy - u} above need, MOQ ${p.moqUnits})` : ""}`,
        amountInr: amt,
        basis: "simulated-quote",
        detail: `₹${p.unitPriceInr[size].toFixed(2)}/unit, quoted ${settings.quoteDate}, lead time ${p.leadTimeDays} days`
      });
    }
    if (p.setupCostInr > 0) lines.push({ group: "setup", label: `${sup.name}: printing / setup`, amountInr: p.setupCostInr, basis: "simulated-quote", detail: "One-time per order line" });
  }
  for (const sid of suppliersUsed) {
    const s = getSupplier(sid);
    const km = haversineKm(s, origin) * 1.3;
    const amt = Math.round(150 + Math.max(0, km - 30) * 2.5);
    lines.push({ group: "delivery", label: `Delivery of materials from ${s.city}`, amountInr: amt, basis: "estimate", detail: `≈${Math.round(km)} km courier/transport estimate` });
  }
  const consumables = items.reduce((a, i) => a + i.consumablesInr, 0);
  if (consumables > 0) lines.push({ group: "consumables", label: "Sealing / flushing consumables", amountInr: consumables, basis: "estimate", detail: [...new Set(items.map((i) => i.consumablesDetail).filter(Boolean))].join("; ") });
  const minutes = items.reduce((a, i) => a + i.labourMinutes, 0);
  lines.push({ group: "labour", label: `Packing labour (${Math.round(minutes)} min)`, amountInr: (minutes / 60) * settings.labourInrPerHour, basis: "estimate", detail: `₹${settings.labourInrPerHour}/hour` });
  const byService = new Map<string, number>();
  for (const it of items) if (it.serviceId) byService.set(it.serviceId, (byService.get(it.serviceId) ?? 0) + it.units);
  for (const [sid, units] of byService) {
    const s = SUPPLIERS.find((x) => x.id === sid)!;
    const ps = s.packingService!;
    const amt = Math.max(ps.minChargeInr, units * ps.pricePerPackInr);
    lines.push({ group: "service", label: `${s.name}: packing service (${units} packs)`, amountInr: amt, basis: "simulated-quote", detail: `₹${ps.pricePerPackInr}/pack, minimum ₹${ps.minChargeInr}` });
  }
  const outer = items.reduce((a, i) => a + i.outerInr, 0);
  if (outer > 0) lines.push({ group: "outer", label: "Outer packaging (cartons / crates)", amountInr: outer, basis: "estimate", detail: [...new Set(items.map((i) => i.outerDetail).filter(Boolean))].join("; ") });
  lines.push({ group: "transport", label: transport.label, amountInr: transport.costInr, basis: "simulated-quote", detail: `${Math.round(transport.transitHours)} h door-to-door (simulated rate card)` });
  const taxablePack = lines.filter((l) => ["material", "setup", "consumables", "outer", "delivery", "service"].includes(l.group)).reduce((a, l) => a + l.amountInr, 0);
  lines.push({ group: "tax", label: `GST on packaging & services (${settings.gstPackagingPct}%)`, amountInr: (taxablePack * settings.gstPackagingPct) / 100, basis: "estimate", detail: "Default rate — verify the applicable HSN/SAC rate" });
  lines.push({ group: "tax", label: `GST on transport (${settings.gstTransportPct}%)`, amountInr: (transport.costInr * settings.gstTransportPct) / 100, basis: "estimate", detail: "Default GTA rate — verify" });
  const total = lines.reduce((a, l) => a + l.amountInr, 0);
  const kg = items.reduce((a, i) => a + i.kg, 0);
  const round = (x: number) => Math.round(x * 100) / 100;
  return { lines: lines.map((l) => ({ ...l, amountInr: round(l.amountInr) })), totalInr: round(total), perKgInr: round(total / Math.max(kg, 1e-9)), packagingOnlyInr: round(total - transport.costInr * (1 + settings.gstTransportPct / 100)), materialInr: round(materialTotal) };
}

/** Standalone cost of one portion's packaging (for ranking before order aggregation). */
export function standaloneCost(it: CostItem): number {
  if (!it.supplierProductId) return Infinity;
  const p = SUPPLIER_PRODUCTS.find((x) => x.id === it.supplierProductId)!;
  const units = Math.max(it.units, p.moqUnits);
  let svc = 0;
  if (it.serviceId) {
    const ps = SUPPLIERS.find((x) => x.id === it.serviceId)!.packingService!;
    svc = Math.max(ps.minChargeInr, it.units * ps.pricePerPackInr);
  }
  return units * p.unitPriceInr[it.sizeKey] + p.setupCostInr + it.consumablesInr + it.outerInr + svc + (it.labourMinutes / 60) * DEFAULT_COST_SETTINGS.labourInrPerHour;
}
