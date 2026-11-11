"""MJH rate-limit + CAPTCHA dependencies.

Thin wrappers around ``platform_shared`` services that close over MJH-local
``settings`` so per-request reads pick up monkeypatches in tests.

C1 wires the Turnstile gate on registration / forgot-password.
C3 wires the per-IP login throttle and the account-lockout dependency over
the shared M6 factories. Each app owns its own thresholds + user-lookup
callable; the shared module deliberately does not import any app's
``settings`` or repositories.

Existing tests can keep monkeypatching the module-level symbols
(``get_user_by_email``, ``verify_turnstile_token``) via
``patch("app.core.rate_limit.<symbol>", ...)`` — we deliberately re-bind
the dependencies to the module-level names so those patches still take
effect on the next request.
"""

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.rate_limit import (
    RateLimiter,
    check_user_rate_limit,
    make_check_account_not_locked,
    make_check_login_ip_limit,
    make_check_json_login_not_locked,
    make_require_turnstile,
)
from platform_shared.services.turnstile_service import verify_turnstile_token

from app.core.config import settings
from app.db.session import get_db
# Case-insensitive like fastapi-users, or changing one letter's case gets past the lock check.
from app.repositories.user.user_repo import get_by_email_ci as get_user_by_email


__all__ = [
    "RateLimiter",
    "RATE_LIMIT_GENERIC_DETAIL",
    "get_user_by_email",
    "login_limiter",
    "totp_limiter",
    "check_user_rate_limit",
    "check_login_rate_limit",
    "check_totp_rate_limit",
    "check_account_not_locked",
    "check_totp_account_not_locked",
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

# Mirrors MBK's totp_limiter (20 / 300s) — separate from login_limiter so
# the TOTP path can be tuned independently. Hardcoded to match MBK exactly;
# move to settings if MJH ever needs operator-tunable TOTP throttle.
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)


# ---------------------------------------------------------------------------
# Turnstile (C1)
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
# Login throttle + lockout (C3)
# ---------------------------------------------------------------------------


_check_login_ip_limit = make_check_login_ip_limit(login_limiter)


async def check_login_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    await _check_login_ip_limit(request, db)


_check_totp_ip_limit = make_check_login_ip_limit(totp_limiter, extra_metadata={"gate": "totp"})


async def check_totp_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    await _check_totp_ip_limit(request, db)


# The lambda looks the function up at call time, so tests can patch it here.
_check_form_login_not_locked = make_check_account_not_locked(
    lambda db, email: get_user_by_email(db, email),
)


async def check_account_not_locked(
    request: Request,
    credentials: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _check_form_login_not_locked(credentials, db, request)


# The lambda looks the function up at call time, so tests can patch it here.
_check_json_login_not_locked = make_check_json_login_not_locked(
    lambda db, email: get_user_by_email(db, email),
)


async def check_totp_account_not_locked(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Reject JSON logins for locked accounts."""
    await _check_json_login_not_locked(request, db)
