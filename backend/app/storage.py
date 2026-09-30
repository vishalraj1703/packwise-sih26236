"""Document storage: S3-compatible object storage when configured, local disk otherwise.

Files are always addressed as /uploads/<key>, so URLs stay the same whichever backend is used.
"""
from __future__ import annotations

import mimetypes
import secrets
from pathlib import Path

from .config import S3_BUCKET, S3_ENDPOINT_URL, UPLOAD_DIR

_s3 = None


def _client():
    global _s3
    if _s3 is None:
        import boto3  # optional dependency, only needed with S3_BUCKET

        _s3 = boto3.client("s3", endpoint_url=S3_ENDPOINT_URL) if S3_ENDPOINT_URL else boto3.client("s3")
    return _s3


def backend_name() -> str:
    return "s3" if S3_BUCKET else "local-disk"


def safe_ext(filename: str | None, content_type: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".pdf"):
        ext = mimetypes.guess_extension(content_type or "") or ".bin"
    return ext


def put(folder: str, data: bytes, content_type: str, filename: str | None = None) -> str:
    key = f"{folder}/{secrets.token_hex(6)}{safe_ext(filename, content_type)}"
    if S3_BUCKET:
        _client().put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
    else:
        path = UPLOAD_DIR / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return key


def get(key: str) -> tuple[bytes, str] | None:
    if ".." in key or key.startswith("/"):
        return None
    if S3_BUCKET:
        try:
            obj = _client().get_object(Bucket=S3_BUCKET, Key=key)
        except Exception:  # noqa: BLE001 — missing object
            return None
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")
    path = UPLOAD_DIR / key
    if not path.is_file():
        return None
    return path.read_bytes(), mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def delete(key: str) -> None:
    if S3_BUCKET:
        _client().delete_object(Bucket=S3_BUCKET, Key=key)
    else:
        (UPLOAD_DIR / key).unlink(missing_ok=True)
