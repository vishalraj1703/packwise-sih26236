// Optional Claude integration: photo identification, report extraction and a
// grounded explainer. The app works without it (manual selection, manual entry,
// offline retrieval assistant). The language model never supplies OTR, WVTR,
// thicknesses, gas mixtures or expiry dates — those come from the engine.
import Anthropic from "@anthropic-ai/sdk";
import { COMMODITIES } from "../shared/data/commodities";

const MODEL = process.env.PACKWISE_MODEL ?? "claude-opus-5-5";
let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  if (process.env.PACKWISE_AI === "off") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.PACKWISE_AI === "on");
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export class AiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

type Content = Anthropic.Beta.BetaContentBlockParam[];

async function structured<T>(system: string, content: Content, schema: Record<string, unknown>, maxTokens = 4000): Promise<T> {
  const text = await call(system, [{ role: "user", content }], maxTokens, schema);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("The model returned an unreadable response. Please enter the values manually.");
  }
}

async function call(system: string, messages: Anthropic.Beta.BetaMessageParam[], maxTokens: number, schema?: Record<string, unknown>): Promise<string> {
  if (!aiAvailable()) throw new AiError("AI features are not configured on this server (set ANTHROPIC_API_KEY). Use manual entry instead.", 503);
  try {
    const params: Record<string, unknown> = {
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", ...(schema ? { format: { type: "json_schema", schema } } : {}) }
    };
    const response = (await getClient().beta.messages.create(params as any)) as Anthropic.Beta.BetaMessage;
    if (response.stop_reason === "refusal") throw new AiError("The AI declined this request. Please enter the information manually.", 422);
    if (response.stop_reason === "max_tokens") throw new AiError("The AI response was cut off. Try a shorter document or enter values manually.");
    return response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("AI credentials are invalid on this server.", 503);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("AI service is busy — please retry shortly.", 429);
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`AI request rejected: ${e.message}`, 400);
    if (e instanceof Anthropic.APIError) throw new AiError(`AI service error (${e.status}).`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("Cannot reach the AI service (offline?). Use manual selection.", 503);
    throw e;
  }
}

// ---------------------------------------------------------------------------
const commodityIds = [...COMMODITIES.map((c) => c.id), "other"];

export interface IdentifyResult {
  candidates: Array<{ commodityId: string; commonName: string; confidence: number; processingState: string; visibleCondition: string }>;
  visibleObservations: string[];
  cannotBeDeterminedFromPhoto: string[];
}

export async function identifyFood(imageB64: string, mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"): Promise<IdentifyResult> {
  const system = [
    "You help small food producers in India identify a food commodity from a photograph for a packaging advisor.",
    "Report only what is visible: likely commodity, processing state (fresh-whole, fresh-cut, dried, unroasted, roasted, fried, milled, processed, frozen) and visible condition (e.g. whole vs broken kernels, bruising, mould, ripeness colour).",
    `Map the commodity to one of these ids where it fits, otherwise use "other": ${commodityIds.join(", ")}.`,
    "Give up to three candidates with honest confidence between 0 and 1. The user will confirm.",
    "Never estimate moisture, water activity, pH, fat, respiration or microbial condition — list those under cannotBeDeterminedFromPhoto."
  ].join("\n");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["candidates", "visibleObservations", "cannotBeDeterminedFromPhoto"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["commodityId", "commonName", "confidence", "processingState", "visibleCondition"],
          properties: {
            commodityId: { type: "string", enum: commodityIds },
            commonName: { type: "string" },
            confidence: { type: "number" },
            processingState: { type: "string" },
            visibleCondition: { type: "string" }
          }
        }
      },
      visibleObservations: { type: "array", items: { type: "string" } },
      cannotBeDeterminedFromPhoto: { type: "array", items: { type: "string" } }
    }
  };
  return structured<IdentifyResult>(system, [
    { type: "image", source: { type: "base64", media_type: mediaType, data: imageB64 } },
    { type: "text", text: "Identify the food in this photo for packaging selection." }
  ], schema, 2000);
}

export interface ExtractResult {
  documentType: string;
  labOrIssuer: string;
  reportDate: string;
  sampleDescription: string;
  values: Array<{ property: string; value: number; unit: string; method: string; testConditions: string; sourceLocation: string }>;
  warnings: string[];
}

export async function extractReport(fileB64: string, mediaType: string): Promise<ExtractResult> {
  const system = [
    "You extract measured values from food test reports or packaging supplier specifications.",
    "Copy values exactly as printed with their units, test method (e.g. AOAC, ASTM D3985, ASTM F1249) and test conditions (temperature, RH).",
    "Property must be one of: moisture_wb, water_activity, ph, fat, salt, acidity, peroxide_value, respiration_rate, otr, wvtr, thickness, seal_strength, other.",
    "If a value, unit or date is missing or illegible, do not guess — add a warning. Use an empty string for unknown text fields.",
    "Add a warning if the sample description may not match the user's batch."
  ].join("\n");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["documentType", "labOrIssuer", "reportDate", "sampleDescription", "values", "warnings"],
    properties: {
      documentType: { type: "string" },
      labOrIssuer: { type: "string" },
      reportDate: { type: "string" },
      sampleDescription: { type: "string" },
      values: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["property", "value", "unit", "method", "testConditions", "sourceLocation"],
          properties: {
            property: { type: "string", enum: ["moisture_wb", "water_activity", "ph", "fat", "salt", "acidity", "peroxide_value", "respiration_rate", "otr", "wvtr", "thickness", "seal_strength", "other"] },
            value: { type: "number" },
            unit: { type: "string" },
            method: { type: "string" },
            testConditions: { type: "string" },
            sourceLocation: { type: "string" }
          }
        }
      },
      warnings: { type: "array", items: { type: "string" } }
    }
  };
  const block: Anthropic.Beta.BetaContentBlockParam = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileB64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: fileB64 } };
  return structured<ExtractResult>(system, [block, { type: "text", text: "Extract the measured values from this report." }], schema, 6000);
}

export async function groundedAnswer(question: string, history: Array<{ role: "user" | "assistant"; content: string }>, passages: Array<{ id: string; title: string; text: string; updated: string }>, context: string, language: string): Promise<string> {
  const system = [
    "You are PackWise, a packaging assistant for Indian farmers, startups and small food businesses.",
    "Answer ONLY from the evidence passages and the assessment context provided. Cite passages like [K3].",
    "Never invent OTR, WVTR, film thickness, gas mixtures, shelf life or expiry dates. If a number is not in the passages or context, say that it must come from the recommendation engine, a supplier test report or a measurement.",
    "If the evidence is insufficient, say so plainly and say what measurement or expert input would help.",
    "Use simple words. Keep answers short (under 180 words) unless asked for detail.",
    `Reply in this language: ${language}.`
  ].join("\n");
  const evidence = passages.map((p) => `[${p.id}] ${p.title} (library updated ${p.updated})\n${p.text}`).join("\n\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `Evidence passages:\n${evidence || "(none found)"}\n\nAssessment context:\n${context || "(none)"}\n\nQuestion: ${question}` }
  ];
  return call(system, messages, 1500);
}
