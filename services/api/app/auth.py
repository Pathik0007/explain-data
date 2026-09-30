"""Optional auth: verifies Supabase (or any HS256) JWTs when SUPABASE_JWT_SECRET is set.

Without the secret (local development) every request is treated as the anonymous user "dev".
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException


def current_user(authorization: str | None = Header(default=None)) -> dict:
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        return {"sub": "dev"}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in first.")
    import jwt

    try:
        return jwt.decode(authorization.split(" ", 1)[1], secret, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session has expired. Sign in again.")
