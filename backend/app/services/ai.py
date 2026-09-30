"""Optional hosted-LLM features (configurable; Claude by default): photo identification,
report extraction and a retrieval-grounded explainer.

The scientific engine assesses suitability; the LLM only explains. It never supplies OTR,
WVTR, thickness, gas mixtures or expiry dates.
"""
from __future__ import annotations

import json
import os

from .. import reference as ref
from ..config import MODEL


class AiError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def ai_available() -> bool:
    if os.environ.get("PACKWISE_AI") == "off":
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("PACKWISE_AI") == "on")


_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()
    return _client


def _call(system: str, messages: list[dict], max_tokens: int, schema: dict | None = None) -> str:
    if not ai_available():
        raise AiError("AI features are not configured on this server (set ANTHROPIC_API_KEY). Use manual entry instead.", 503)
    import anthropic

    output_config: dict = {"effort": "medium"}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    try:
        resp = _get_client().beta.messages.create(
            model=MODEL, max_tokens=max_tokens, system=system, messages=messages,
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default", "output_config": output_config},
        )
    except anthropic.AuthenticationError as e:
        raise AiError("AI credentials are invalid on this server.", 503) from e
    except anthropic.RateLimitError as e:
        raise AiError("AI service is busy — please retry shortly.", 429) from e
    except anthropic.BadRequestError as e:
        raise AiError(f"AI request rejected: {e.message}", 400) from e
    except anthropic.APIStatusError as e:
        raise AiError(f"AI service error ({e.status_code}).") from e
    except anthropic.APIConnectionError as e:
        raise AiError("Cannot reach the AI service (offline?). Use manual selection.", 503) from e
    if resp.stop_reason == "refusal":
        raise AiError("The AI declined this request. Please enter the information manually.", 422)
    if resp.stop_reason == "max_tokens":
        raise AiError("The AI response was cut off. Try a shorter document or enter values manually.")
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")


def _structured(system: str, content: list[dict], schema: dict, max_tokens: int = 4000) -> dict:
    text = _call(system, [{"role": "user", "content": content}], max_tokens, schema)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise AiError("The model returned an unreadable response. Please enter the values manually.") from e


def identify_food(image_b64: str, media_type: str) -> dict:
    ids = [c["id"] for c in ref.commodities()] + ["other"]
    system = "\n".join([
        "You help small food producers in India identify a food commodity from a photograph for a packaging advisor.",
        "Report only what is visible: likely commodity, processing state (fresh-whole, fresh-cut, dried, unroasted, roasted, fried, milled, processed, frozen) and visible condition.",
        f'Map the commodity to one of these ids where it fits, otherwise use "other": {", ".join(ids)}.',
        "Give up to three candidates with honest confidence between 0 and 1. The user will confirm.",
        "Never estimate moisture, water activity, pH, fat, respiration or microbial condition — list those under cannotBeDeterminedFromPhoto.",
    ])
    schema = {"type": "object", "additionalProperties": False, "required": ["candidates", "visibleObservations", "cannotBeDeterminedFromPhoto"],
              "properties": {
                  "candidates": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                                             "required": ["commodityId", "commonName", "confidence", "processingState", "visibleCondition"],
                                                             "properties": {"commodityId": {"type": "string", "enum": ids}, "commonName": {"type": "string"}, "confidence": {"type": "number"},
                                                                            "processingState": {"type": "string"}, "visibleCondition": {"type": "string"}}}},
                  "visibleObservations": {"type": "array", "items": {"type": "string"}},
                  "cannotBeDeterminedFromPhoto": {"type": "array", "items": {"type": "string"}}}}
    return _structured(system, [{"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                                {"type": "text", "text": "Identify the food in this photo for packaging selection."}], schema, 2000)


def extract_report(file_b64: str, media_type: str) -> dict:
    system = "\n".join([
        "You extract measured values from food test reports or packaging supplier specifications.",
        "Copy values exactly as printed with their units, test method and test conditions.",
        "Property must be one of: moisture_wb, water_activity, ph, fat, salt, acidity, peroxide_value, respiration_rate, otr, wvtr, thickness, seal_strength, other.",
        "If a value, unit or date is missing or illegible, do not guess — add a warning. Use an empty string for unknown text fields.",
        "Add a warning if the sample description may not match the user's batch.",
    ])
    props = ["moisture_wb", "water_activity", "ph", "fat", "salt", "acidity", "peroxide_value", "respiration_rate", "otr", "wvtr", "thickness", "seal_strength", "other"]
    schema = {"type": "object", "additionalProperties": False, "required": ["documentType", "labOrIssuer", "reportDate", "sampleDescription", "values", "warnings"],
              "properties": {"documentType": {"type": "string"}, "labOrIssuer": {"type": "string"}, "reportDate": {"type": "string"}, "sampleDescription": {"type": "string"},
                             "values": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                                                    "required": ["property", "value", "unit", "method", "testConditions", "sourceLocation"],
                                                                    "properties": {"property": {"type": "string", "enum": props}, "value": {"type": "number"}, "unit": {"type": "string"},
                                                                                   "method": {"type": "string"}, "testConditions": {"type": "string"}, "sourceLocation": {"type": "string"}}}},
                             "warnings": {"type": "array", "items": {"type": "string"}}}}
    block = ({"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": file_b64}} if media_type == "application/pdf"
             else {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": file_b64}})
    return _structured(system, [block, {"type": "text", "text": "Extract the measured values from this report."}], schema, 6000)


def grounded_answer(question: str, history: list[dict], passages: list[dict], context: str, language: str) -> str:
    system = "\n".join([
        "You are PackWise, a packaging assistant for Indian farmers, startups and small food businesses.",
        "Answer ONLY from the evidence passages and the assessment context provided. Cite passages like [K3].",
        "Never invent OTR, WVTR, film thickness, gas mixtures, shelf life or expiry dates. If a number is not in the passages or context, say it must come from the recommendation engine, a supplier test report or a measurement.",
        "If the evidence is insufficient, say so plainly and say what measurement or expert input would help.",
        "Use simple words. Keep answers short (under 180 words) unless asked for detail.",
        f"Reply in this language: {language}.",
    ])
    evidence = "\n\n".join(f'[{p["id"]}] {p["title"]} (library updated {p["updated"]})\n{p["text"]}' for p in passages)
    msgs = [{"role": m["role"], "content": m["content"]} for m in history[-8:]]
    msgs.append({"role": "user", "content": f"Evidence passages:\n{evidence or '(none found)'}\n\nAssessment context:\n{context or '(none)'}\n\nQuestion: {question}"})
    return _call(system, msgs, 1500)
