"""Runtime configuration from environment variables."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("PACKWISE_DATA_DIR", ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# PostgreSQL in production (DATABASE_URL from Railway), SQLite file for local development.
_db = os.environ.get("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'packwise.sqlite3').as_posix()}")
if _db.startswith("postgres://"):
    _db = "postgresql+psycopg://" + _db[len("postgres://"):]
elif _db.startswith("postgresql://"):
    _db = "postgresql+psycopg://" + _db[len("postgresql://"):]
DATABASE_URL = _db

UPLOAD_DIR = Path(os.environ.get("PACKWISE_UPLOAD_DIR", DATA_DIR / "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
S3_BUCKET = os.environ.get("S3_BUCKET")  # S3-compatible object storage (optional)
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL")  # e.g. Cloudflare R2 / MinIO endpoint

WEB_DIST = Path(os.environ.get("PACKWISE_WEB_DIST", ROOT / "dist"))
DEMO_PASSWORD = os.environ.get("PACKWISE_DEMO_PASSWORD", "packwise-demo")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL")
MODEL = os.environ.get("PACKWISE_MODEL", "claude-opus-5-5")
