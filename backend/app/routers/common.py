"""Helpers shared by routers."""
from __future__ import annotations

import json

from fastapi import Request

from ..config import PUBLIC_BASE_URL


def row(obj, **extra) -> dict:
    """ORM row → dict; JSON columns (*_json) are serialised as strings, matching the web client's expectations."""
    d = obj.as_dict()
    for k, v in list(d.items()):
        if k.endswith("_json") and v is not None and not isinstance(v, str):
            d[k] = json.dumps(v, ensure_ascii=False)
        if isinstance(v, bool):
            d[k] = 1 if v else 0
    d.update(extra)
    return d


def base_url(req: Request) -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL.rstrip("/")
    host = req.headers.get("x-forwarded-host") or req.headers.get("host")
    proto = req.headers.get("x-forwarded-proto") or req.url.scheme
    return f"{proto}://{host}"
