"""MBK rate-limit + login-throttle wrapper over :mod:`platform_shared.core.rate_limit`.

After PR M6 the pure token-bucket implementation, the per-IP login
throttle, the registration / password-reset / Turnstile gates, and the
account-lockout dependency all live in ``platform_shared``. This module
keeps the parts that legitimately depend on MBK config + MBK's user
repository:

  * pre-instantiated ``RateLimiter`` instances at MBK's policy thresholds
    (``login``: 10 / 5 min, ``register``: 5 / 1 h, etc.)
  * thin dependency bodies that close over MBK-local symbols
    (``login_limiter``, ``verify_turnstile_token``, ``get_user_by_email``)
    so existing tests can keep monkeypatching them via
    ``patch("app.core.rate_limit.<symbol>", ...)``
  * ``settings.turnstile_secret_key`` lookup is lazy so
    ``patch.object(settings, "turnstile_secret_key", "...")`` still
    works during a single request.

Existing call sites inside MBK (``app.main``, ``app.api.totp``, route
gates, tests) keep their imports — every public name from before M6
still resolves here.
"""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.rate_limit import RateLimiter, email_domain_from_request
from platform_shared.services.turnstile_service import verify_turnstile_token

from app.core.config import settings
from app.core.request_utils import get_client_ip
from app.db.session import get_db
from app.repositories.user.user_repo import get_by_email as get_user_by_email
from app.services.system.auth_event_service import log_auth_event


__all__ = [
    "RateLimiter",
    "RATE_LIMIT_GENERIC_DETAIL",
    "verify_turnstile_token",
    "get_user_by_email",
    "login_limiter",
    "totp_limiter",
    "register_limiter",
    "password_reset_limiter",
    "export_limiter",
    "frontend_error_limiter",
    "require_turnstile",
    "check_login_rate_limit",
    "check_totp_rate_limit",
    "check_password_reset_rate_limit",
    "check_register_rate_limit",
    "check_account_not_locked",
]


# ---------------------------------------------------------------------------
# MBK rate-limit policy — pre-instantiated limiters
# ---------------------------------------------------------------------------

login_limiter = RateLimiter(max_attempts=10, window_seconds=300)
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
password_reset_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
export_limiter = RateLimiter(max_attempts=20, window_seconds=3600)
frontend_error_limiter = RateLimiter(max_attempts=50, window_seconds=3600)


# ---------------------------------------------------------------------------
# FastAPI dependencies
#
# Each dependency body deliberately references the *module-level* symbols
# (``login_limiter``, ``verify_turnstile_token``, ``get_user_by_email``,
# ``settings``) so that existing tests using
# ``patch("app.core.rate_limit.<symbol>", …)`` still influence the
# dependency's behaviour. Calling the shared ``make_*`` factories at
# import time would close over the values present at startup and make
# those patches no-ops.
# ---------------------------------------------------------------------------


async def check_login_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Per-IP rate limit for login endpoints with audit logging.

    On block, writes a ``LOGIN_BLOCKED_RATE_LIMIT`` auth event before
    re-raising so SOC/admin tooling can see credential-stuffing patterns.
    The 429 body is intentionally identical to the account-lockout
    response so callers cannot infer which gate fired.
    """
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


async def check_totp_rate_limit(request: Request) -> None:
    totp_limiter.check(get_client_ip(request))


async def check_password_reset_rate_limit(request: Request) -> None:
    password_reset_limiter.check(get_client_ip(request))


async def require_turnstile(request: Request) -> None:
    """FastAPI dependency that enforces Turnstile CAPTCHA verification.

    No-op when ``settings.turnstile_secret_key`` is empty (dev/CI mode).
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


async def check_register_rate_limit(request: Request) -> None:
    register_limiter.check(get_client_ip(request))
    await require_turnstile(request)


async def check_account_not_locked(
    credentials: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Reject login attempts for accounts currently under lockout.

    Runs BEFORE the password check so that a locked account is rejected
    without revealing password correctness, and without incrementing the
    failure counter further (the counter is only incremented inside
    UserManager.authenticate on a real password failure).
    """
    user = await get_user_by_email(db, credentials.username)
    if user is None:
        # Unknown email — let the normal auth flow handle it (timing-safe).
        return
    if user.locked_until and user.locked_until > datetime.now(tz=timezone.utc):
        raise HTTPException(
            status_code=429,
            detail=RATE_LIMIT_GENERIC_DETAIL,
        )
