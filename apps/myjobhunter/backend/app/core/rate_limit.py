"""MJH rate-limit + CAPTCHA dependencies.

Thin wrappers around ``platform_shared`` services that close over MJH-local
``settings`` so per-request reads pick up monkeypatches in tests.

Phase 1 only wires the Turnstile gate on registration / forgot-password.
Per-IP login throttle, account lockout, and the rest of the M-series
defenses come in later C-series PRs.
"""
from fastapi import HTTPException, Request

from platform_shared.core.request_utils import get_client_ip
from platform_shared.services.turnstile_service import verify_turnstile_token

from app.core.config import settings


__all__ = [
    "verify_turnstile_token",
    "require_turnstile",
]


async def require_turnstile(request: Request) -> None:
    """FastAPI dependency that enforces Turnstile CAPTCHA verification.

    No-op when ``settings.turnstile_secret_key`` is empty (dev/CI mode).
    On a real deployment the dependency reads the ``X-Turnstile-Token``
    header set by the frontend widget and verifies it against Cloudflare's
    siteverify endpoint.
    """
    if not settings.turnstile_secret_key:
        return
    token = request.headers.get("X-Turnstile-Token", "")
    if not token:
        raise HTTPException(status_code=400, detail="Captcha token required")
    valid = await verify_turnstile_token(
        token,
        get_client_ip(request),
        secret_key=settings.turnstile_secret_key,
    )
    if not valid:
        raise HTTPException(status_code=400, detail="Captcha verification failed")
