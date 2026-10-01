"""PackWise API — Python + FastAPI.

Serves the REST API for the Flutter app and the React web dashboard, the shared reference
images, uploaded documents (local disk or S3-compatible storage) and, in production, the
built web dashboard.
"""
from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_, select

from . import reference as ref
from . import storage
from .config import WEB_DIST
from .db import Batch, SessionLocal
from .routers import core, trace, trials
from .seed import seed_if_empty

@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_if_empty()
    yield


app = FastAPI(lifespan=lifespan, title="PackWise API", version="2.0.0", description="Evidence-backed food packaging advisor — SIH Problem Statement 26236")


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    details = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e["loc"] if x not in ("body", "query", "path"))
        details.append(f"{loc}: {e['msg']}" if loc else e["msg"])
    return JSONResponse({"error": "Invalid input", "details": details}, status_code=400)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail if isinstance(exc.detail, str) else "Request failed"}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    return resp


app.include_router(core.router)
app.include_router(trace.router)
app.include_router(trials.router)
app.mount("/images", StaticFiles(directory=ref.ROOT / "images"), name="images")


@app.get("/uploads/{key:path}")
def uploads(key: str):
    got = storage.get(key)
    if not got:
        raise HTTPException(404, "Not found")
    data, ctype = got
    return Response(data, media_type=ctype, headers={"Cache-Control": "private, max-age=3600"})


@app.get("/01/{gtin}/10/{batch}")
def digital_link(gtin: str, batch: str):
    """GS1 Digital Link-style resolver (concept only; no compliance claim)."""
    with SessionLocal() as db:
        b = db.execute(select(Batch).where(Batch.batch_code == batch, or_(Batch.gtin == gtin, Batch.gtin.is_(None)))).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Unknown product/batch")
    return RedirectResponse(f"/t/{b.public_token}", 302)


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_404(rest: str):
    return JSONResponse({"error": "Not found"}, status_code=404)


# Built React dashboard (production): static assets + SPA fallback.
if (WEB_DIST / "index.html").exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (WEB_DIST / path).resolve()
        if path and f.is_file() and WEB_DIST.resolve() in f.parents:
            if f.suffix == ".apk":  # Android app download
                return FileResponse(f, media_type="application/vnd.android.package-archive", filename=f.name)
            media = mimetypes.guess_type(f.name)[0]
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if "/assets/" in f.as_posix() else {}
            return FileResponse(f, media_type=media, headers=headers)
        return FileResponse(WEB_DIST / "index.html", headers={"Cache-Control": "no-cache"})
