"""Rate-limit + CAPTCHA dependencies.

Thin wrappers around ``platform_shared`` services that close over app-local
``settings``. The scaffold has no public registration (single-user app) so the
Turnstile gate is only wired on forgot-password (for the admin operator).

Mirrors apps/myjobhunter/backend/app/core/rate_limit.py (name + thresholds only).
"""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.rate_limit import (
    RateLimiter,
    email_domain_from_request,
    make_require_turnstile,
)
from platform_shared.core.request_utils import get_client_ip
from platform_shared.services.turnstile_service import verify_turnstile_token

from app.core.config import settings
from app.db.session import get_db
from app.repositories.user.user_repo import get_by_email as get_user_by_email
from app.services.system.auth_event_service import log_auth_event


__all__ = [
    "RateLimiter",
    "RATE_LIMIT_GENERIC_DETAIL",
    "get_user_by_email",
    "login_limiter",
    "totp_limiter",
    "public_order_limiter",
    "public_lookup_limiter",
    "check_login_rate_limit",
    "check_totp_rate_limit",
    "check_account_not_locked",
    "check_totp_account_not_locked",
    "check_public_order_rate_limit",
    "check_public_lookup_rate_limit",
    "verify_turnstile_token",
    "require_turnstile",
]


# ---------------------------------------------------------------------------
# Pre-instantiated limiters
# ---------------------------------------------------------------------------

login_limiter = RateLimiter(
    max_attempts=settings.login_rate_limit_threshold,
    window_seconds=settings.login_rate_limit_window_seconds,
)

# Mirrors MJH's totp_limiter (20 / 300s).
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)

# Anonymous customer-facing endpoints (app/api/public.py). These have no auth
# and touch persistence, so they are per-IP throttled to blunt automated abuse:
#   - order placement: flood → slot-capacity exhaustion (business DoS) + junk
#     customer rows. 8 / 5 min is generous for a real customer (1-3 orders).
#   - phone lookup: a PII/existence oracle (name + order shape by phone). 12 /
#     5 min covers a customer correcting a typo while blocking mass enumeration.
# Turnstile is intentionally NOT wired on these anonymous customer routes: the
# public order bundle sends no token, so gating them on the secret would break
# ordering the moment TURNSTILE_SECRET_KEY is set. Bot management for anonymous
# public traffic belongs at the Cloudflare edge; the per-IP throttle is the
# proportionate in-app control.
public_order_limiter = RateLimiter(max_attempts=8, window_seconds=300)
public_lookup_limiter = RateLimiter(max_attempts=12, window_seconds=300)


# ---------------------------------------------------------------------------
# Turnstile (wired on forgot-password only — no public registration)
# ---------------------------------------------------------------------------


async def _verify_turnstile(*args: object, **kwargs: object) -> tuple[bool, list[str]]:
    # Resolve the module-level name at call time so tests can keep patching
    # ``app.core.rate_limit.verify_turnstile_token``.
    return await verify_turnstile_token(*args, **kwargs)  # type: ignore[arg-type]


# Shared factory (platform_shared.core.rate_limit): no-op when the secret is
# empty; 400 on missing token / captcha_expired_please_retry /
# captcha_verification_failed; 503 captcha_service_misconfigured + an ERROR log
# on a bad secret.
require_turnstile = make_require_turnstile(
    lambda: settings.turnstile_secret_key,
    verify=_verify_turnstile,
)


# ---------------------------------------------------------------------------
# Login throttle + lockout
# ---------------------------------------------------------------------------


async def check_login_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Per-IP rate limit for login endpoints with audit logging."""
    ip = get_client_ip(request)
    try:
        login_limiter.check(ip)
    except HTTPException:
        metadata: dict[str, str] = {"ip": ip}
        domain = email_domain_from_request(request)
        if domain is not None:
            metadata["email_domain"] = domain
        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_BLOCKED_RATE_LIMIT,
            user_id=None,
            request=request,
            succeeded=False,
            metadata=metadata,
        )
        await db.commit()
        raise


async def check_totp_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Per-IP rate limit for the TOTP login endpoint."""
    ip = get_client_ip(request)
    try:
        totp_limiter.check(ip)
    except HTTPException:
        metadata: dict[str, str] = {"ip": ip, "gate": "totp"}
        domain = email_domain_from_request(request)
        if domain is not None:
            metadata["email_domain"] = domain
        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_BLOCKED_RATE_LIMIT,
            user_id=None,
            request=request,
            succeeded=False,
            metadata=metadata,
        )
        await db.commit()
        raise


async def check_totp_account_not_locked(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Reject POST /auth/totp/login attempts for locked accounts."""
    body = await request.json()
    email: str = body.get("email", "")
    if not email:
        return
    user = await get_user_by_email(db, email)
    if user is None:
        return
    if user.locked_until and user.locked_until > datetime.now(tz=timezone.utc):
        raise HTTPException(
            status_code=429,
            detail=RATE_LIMIT_GENERIC_DETAIL,
        )


async def check_account_not_locked(
    credentials: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Reject login attempts for accounts currently under lockout."""
    user = await get_user_by_email(db, credentials.username)
    if user is None:
        return
    if user.locked_until and user.locked_until > datetime.now(tz=timezone.utc):
        raise HTTPException(
            status_code=429,
            detail=RATE_LIMIT_GENERIC_DETAIL,
        )


# ---------------------------------------------------------------------------
# Public (anonymous) customer-endpoint throttles
# ---------------------------------------------------------------------------


async def check_public_order_rate_limit(request: Request) -> None:
    """Per-IP throttle for anonymous order placement (POST /public/orders).

    Blunts order-flood → slot-capacity exhaustion and junk-customer-row
    writes. Raises the shared generic 429 on over-limit.
    """
    public_order_limiter.check(get_client_ip(request))


async def check_public_lookup_rate_limit(request: Request) -> None:
    """Per-IP throttle for the anonymous phone lookup (GET /public/customers/lookup).

    The lookup is an existence/PII oracle keyed on a low-entropy phone
    number; this caps how fast a single source can enumerate. Raises the
    shared generic 429 on over-limit.
    """
    public_lookup_limiter.check(get_client_ip(request))
