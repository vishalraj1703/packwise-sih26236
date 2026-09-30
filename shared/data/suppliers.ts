import type { Supplier, SupplierProduct } from "../types";
import data from "../../reference-data/suppliers.json";

// ALL SUPPLIER DATA IS SIMULATED (source "SIM"). Canonical data: reference-data/suppliers.json.
export const SUPPLIERS = data.suppliers as unknown as Supplier[];
export const SUPPLIER_PRODUCTS = data.products as unknown as SupplierProduct[];
export const ABSORBER_PRICE_INR = data.absorberPriceInr as unknown as Record<number, number>;

export function getSupplier(id: string) {
  return SUPPLIERS.find((s) => s.id === id)!;
}
