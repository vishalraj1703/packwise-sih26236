import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.env.PACKWISE_DATA_DIR ?? "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, "packwise.db");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('producer','transporter','retailer','expert','admin')),
  org TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  api_key_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  parent_id INTEGER REFERENCES assessments(id),
  selected_plan_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  assessment_id INTEGER REFERENCES assessments(id),
  supplier_id TEXT NOT NULL,
  supplier_product_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('quotation','sample','packing-service')),
  units INTEGER NOT NULL,
  size_kg REAL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'responded-simulated',
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS material_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  supplier_product_id TEXT NOT NULL,
  lot_code TEXT NOT NULL,
  received_at TEXT NOT NULL,
  units_received INTEGER NOT NULL,
  receiving_check_json TEXT NOT NULL,
  accepted INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_token TEXT UNIQUE NOT NULL,
  batch_code TEXT UNIQUE NOT NULL,
  gtin TEXT,
  producer_id INTEGER REFERENCES users(id),
  assessment_id INTEGER REFERENCES assessments(id),
  candidate_key TEXT,
  recommendation_version TEXT,
  commodity_id TEXT NOT NULL,
  commodity_name TEXT NOT NULL,
  state TEXT,
  origin TEXT,
  harvest_date TEXT,
  packed_at TEXT NOT NULL,
  quantity_kg REAL NOT NULL,
  units INTEGER NOT NULL,
  pack_size_kg REAL NOT NULL,
  structure_id TEXT,
  structure_name TEXT,
  oxygen_control TEXT,
  material_lot_id INTEGER REFERENCES material_lots(id),
  supplier_product_id TEXT,
  packing_checks_json TEXT,
  handling_json TEXT,
  parent_batch_id INTEGER REFERENCES batches(id),
  status TEXT NOT NULL DEFAULT 'packed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  transporter_id INTEGER REFERENCES users(id),
  receiver_id INTEGER REFERENCES users(id),
  declared_conditions_json TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shipment_batches (
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  units INTEGER NOT NULL,
  PRIMARY KEY (shipment_id, batch_id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('packed','dispatch','handoff','receipt','split','repack','storage-check','retail-sale','investigation')),
  batch_id INTEGER REFERENCES batches(id),
  shipment_id INTEGER REFERENCES shipments(id),
  actor_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  event_time TEXT NOT NULL,
  location TEXT,
  units INTEGER,
  condition_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS retail_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retailer_id INTEGER REFERENCES users(id),
  batch_id INTEGER REFERENCES batches(id),
  gtin TEXT,
  batch_code TEXT,
  unit_serial TEXT,
  quantity INTEGER NOT NULL,
  store TEXT,
  source TEXT NOT NULL,
  sold_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER REFERENCES batches(id),
  unit_serial TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  photos_json TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  manufacturer_notes TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  assessment_id INTEGER REFERENCES assessments(id),
  title TEXT NOT NULL,
  design_json TEXT NOT NULL,
  locked_at TEXT,
  lock_hash TEXT,
  observations_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reviewer_id INTEGER REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','needs-change','rejected')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS verified_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  structure_id TEXT NOT NULL,
  commodity_id TEXT,
  product TEXT NOT NULL,
  brand TEXT NOT NULL,
  photo_path TEXT NOT NULL,
  photo_source TEXT NOT NULL,
  documented_structure TEXT NOT NULL,
  structure_source TEXT NOT NULL,
  labelled_shelf_life TEXT,
  storage_instructions TEXT,
  source_date TEXT NOT NULL,
  reviewer_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_batch ON events(batch_id);
CREATE INDEX IF NOT EXISTS idx_complaints_batch ON complaints(batch_id);
`);

export type Row = Record<string, any>;

export function all(sql: string, ...params: any[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}
export function get(sql: string, ...params: any[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}
export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
