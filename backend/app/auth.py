"""Password hashing (scrypt), sessions (cookie for web, bearer token for mobile) and roles."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionToken, User, get_db

ROLES = ("producer", "transporter", "retailer", "expert", "admin")


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    h = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    return h, salt


def verify_password(password: str, salt: str, expected: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt)[0], expected)


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def create_session(db: Session, user_id: int) -> tuple[str, str]:
    token = secrets.token_hex(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    db.add(SessionToken(token=sha256(token), user_id=user_id, expires_at=expires))
    db.commit()
    return token, expires


def _token(req: Request) -> str | None:
    h = req.headers.get("authorization", "")
    if h.startswith("Bearer "):
        return h[7:]
    return req.cookies.get("pw_session")


def user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "org": u.org}


def current_user(req: Request, db: Session = Depends(get_db)) -> User | None:
    tok = _token(req)
    if not tok:
        return None
    row = db.execute(select(SessionToken).where(SessionToken.token == sha256(tok))).scalar_one_or_none()
    if not row or row.expires_at < datetime.now(timezone.utc).isoformat():
        return None
    return db.get(User, row.user_id)


def require_user(user: User | None = Depends(current_user)) -> User:
    if not user:
        raise HTTPException(401, "Sign in required")
    return user


def require_role(*roles: str):
    def dep(user: User | None = Depends(current_user)) -> User:
        if not user:
            raise HTTPException(401, "Sign in required")
        if user.role not in roles and user.role != "admin":
            raise HTTPException(403, f"This action needs one of these roles: {', '.join(roles)}")
        return user
    return dep


def user_from_api_key(db: Session, key: str | None) -> User | None:
    if not key:
        return None
    return db.execute(select(User).where(User.api_key_hash == sha256(key))).scalar_one_or_none()
