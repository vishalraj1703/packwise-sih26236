"""BM25 retrieval over the reviewed knowledge library (used to ground the online assistant)."""
from __future__ import annotations

import math
import re
import unicodedata
from functools import lru_cache

from .. import reference as ref

STOP = set("a an the of to for and or in on is are be it this that my our your with what how why when which can do does should i we you me about from at by as not no".split())
SYN = {
    "rancid": "rancid", "rancidity": "rancid", "oxidation": "oxygen", "oxidise": "oxygen", "oxidize": "oxygen", "o2": "oxygen",
    "humidity": "moisture", "damp": "moisture", "water": "moisture", "soggy": "moisture", "crisp": "moisture",
    "holes": "perforation", "perforations": "perforation", "perforated": "perforation",
    "kaju": "cashew", "munthiri": "cashew", "cashews": "cashew", "peanut": "nuts", "groundnut": "nuts",
    "box": "carton", "boxes": "carton", "cartons": "carton", "ply": "carton",
    "sealing": "seal", "sealer": "seal", "sealed": "seal",
    "recyclable": "recycle", "recycling": "recycle", "plastic": "recycle",
    "fridge": "temperature", "cold": "temperature", "reefer": "temperature", "refrigerated": "temperature", "heat": "temperature",
    "barcode": "qr", "scan": "qr", "trace": "traceability",
}


def tokenize(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s.lower())
    s = re.sub(r"[^\w\s-]", " ", s)
    out = []
    for t in re.split(r"[\s\-_]+", s):
        if not t or t in STOP:
            continue
        if t in SYN:
            out.append(SYN[t])
            continue
        stem = re.sub(r"(ies|s)$", lambda m: "y" if m.group(0) == "ies" else "", t) if len(t) > 3 else t
        out.append(SYN.get(stem, stem))
    return out


@lru_cache
def _index():
    docs = []
    for a in ref.knowledge()["articles"]:
        toks = tokenize(f'{a["title"]} {a["title"]} {" ".join(a["tags"])} {" ".join(a["tags"])} {a["text"]}')
        docs.append((a, toks))
    df: dict[str, int] = {}
    for _, toks in docs:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1
    avg = sum(len(t) for _, t in docs) / len(docs)
    return docs, df, avg


def search(query: str, k: int = 3) -> list[dict]:
    docs, df, avg = _index()
    q = set(tokenize(query))
    n = len(docs)
    scored = []
    for a, toks in docs:
        score = 0.0
        for t in q:
            f = toks.count(t)
            if not f:
                continue
            idf = math.log(1 + (n - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
            score += idf * f * 2.4 / (f + 1.4 * (0.25 + 0.75 * len(toks) / avg))
        if score > 0.5:
            scored.append({"article": a, "score": score})
    return sorted(scored, key=lambda x: -x["score"])[:k]
