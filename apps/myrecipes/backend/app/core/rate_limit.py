"""Rate-limit + CAPTCHA dependencies.

Thin wrappers around ``platform_shared`` services that close over app-local
``settings``. Public registration is open, so the Turnstile gate guards both
registration and forgot-password.

Auth gates (login, TOTP, registration) are keyed by client IP — the caller is
not yet authenticated. The paid Claude endpoints (photo import, web discovery)
are keyed by user id via ``check_user_rate_limit``: they are bearer-gated, and
an IP key would let one user rotate IPs for unlimited spend while making many
users behind one carrier NAT share a single budget.

Mirrors apps/myjobhunter/backend/app/core/rate_limit.py (name + thresholds only).
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
from platform_shared.core.request_utils import get_client_ip
from platform_shared.services.turnstile_service import verify_turnstile_token

from app.core.auth import current_active_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user.user import User
# Case-insensitive like fastapi-users, or changing one letter's case gets past the lock check.
from app.repositories.user.user_repo import get_by_email_ci as get_user_by_email


__all__ = [
    "RateLimiter",
    "RATE_LIMIT_GENERIC_DETAIL",
    "get_user_by_email",
    "login_limiter",
    "totp_limiter",
    "register_limiter",
    "discovery_limiter",
    "extract_limiter",
    "check_login_rate_limit",
    "check_register_rate_limit",
    "check_totp_rate_limit",
    "check_discovery_rate_limit",
    "check_photo_import_rate_limit",
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

# Mirrors MJH's totp_limiter (20 / 300s).
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)

# Per-IP registration throttle (multi-user app). Registration is far rarer
# than login, so the budget is tight — a burst of signups from one IP is
# almost certainly abuse.
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)

# Per-user web-discovery throttle. Unlike the auth limiters this one is not
# about credential stuffing — every discovery call runs a multi-search Claude
# turn that costs real money, so the budget is a spend ceiling. 20/hour is
# far above normal browsing (a session is a handful of searches) and well
# below what a script could burn unattended.
discovery_limiter = RateLimiter(max_attempts=20, window_seconds=3600)

# Per-user photo-import throttle. Same reasoning as discovery: every
# ``POST /recipes/extract`` is a paid Claude vision call, so this is a spend
# ceiling. 20/hour covers importing a whole cookbook chapter in one sitting
# and is well below what a script could burn unattended.
extract_limiter = RateLimiter(max_attempts=20, window_seconds=3600)


# ---------------------------------------------------------------------------
# Turnstile (wired on registration and forgot-password)
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


_check_login_ip_limit = make_check_login_ip_limit(login_limiter)


async def check_login_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    await _check_login_ip_limit(request, db)


async def check_register_rate_limit(request: Request) -> None:
    """Per-IP rate limit for the public registration endpoint.

    Raises HTTP 429 when the per-IP budget is exhausted. No DB write — unlike
    the login throttle there is no per-account audit dimension to record here.
    """
    register_limiter.check(get_client_ip(request))


async def check_discovery_rate_limit(user: User = Depends(current_active_user)) -> None:
    """Per-user throttle on the paid web-discovery endpoints (429 when spent).

    Depends on ``current_active_user`` so it runs after auth resolves and
    before the handler does any paid work.
    """
    check_user_rate_limit(user.id, discovery_limiter)


async def check_photo_import_rate_limit(user: User = Depends(current_active_user)) -> None:
    """Per-user throttle on the paid photo-import (Claude vision) endpoint (429 when spent).

    Depends on ``current_active_user`` so it runs after auth resolves and
    before the upload is read or Claude is called.
    """
    check_user_rate_limit(user.id, extract_limiter)


_check_totp_ip_limit = make_check_login_ip_limit(totp_limiter, extra_metadata={"gate": "totp"})


async def check_totp_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    await _check_totp_ip_limit(request, db)


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
