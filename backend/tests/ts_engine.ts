// Runs the TypeScript (web) engine on parity fixtures: tsx ts_engine.ts <inputs.json> <outputs.json>
import fs from "node:fs";
import { recommend } from "../../shared/engine/recommend";
const [, , inPath, outPath] = process.argv;
const inputs = JSON.parse(fs.readFileSync(inPath, "utf8"));
const out: Record<string, unknown> = {};
for (const [k, v] of Object.entries(inputs)) out[k] = recommend(v as any);
fs.writeFileSync(outPath, JSON.stringify(out));
