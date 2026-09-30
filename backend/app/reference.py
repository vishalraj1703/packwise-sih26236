"""Loads the canonical reference data shared with the web and Flutter apps."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(os.environ.get("PACKWISE_REFERENCE_DIR", Path(__file__).resolve().parents[2] / "reference-data"))


def _load(name: str):
    with open(ROOT / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def commodities() -> list[dict]:
    return _load("commodities")


@lru_cache
def materials_data() -> dict:
    return _load("materials")


def materials() -> dict[str, dict]:
    return materials_data()["materials"]


def structures() -> list[dict]:
    return materials_data()["structures"]


def plain_name(structure_id: str) -> str:
    return materials_data()["plainNames"].get(structure_id) or get_structure(structure_id)["name"]


@lru_cache
def suppliers_data() -> dict:
    return _load("suppliers")


def suppliers() -> list[dict]:
    return suppliers_data()["suppliers"]


def supplier_products() -> list[dict]:
    return suppliers_data()["products"]


def absorber_price(cc: int) -> float:
    return float(suppliers_data()["absorberPriceInr"].get(str(cc), 10))


@lru_cache
def sources() -> dict[str, dict]:
    return _load("sources")


@lru_cache
def examples_data() -> dict:
    return _load("examples")


def examples_for(structure_id: str) -> list[dict]:
    return [e for e in examples_data()["examples"] if structure_id in e["structureIds"]]


@lru_cache
def knowledge() -> dict:
    return _load("knowledge")


@lru_cache
def images() -> dict:
    return _load("images")


def get_commodity(cid: str) -> dict:
    for c in commodities():
        if c["id"] == cid:
            return c
    raise KeyError(f"Unknown commodity {cid}")


def get_structure(sid: str) -> dict:
    for s in structures():
        if s["id"] == sid:
            return s
    raise KeyError(f"Unknown structure {sid}")


def get_supplier(sid: str) -> dict | None:
    return next((s for s in suppliers() if s["id"] == sid), None)
