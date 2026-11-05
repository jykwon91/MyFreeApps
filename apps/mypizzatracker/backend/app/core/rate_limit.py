"""Rate-limit + CAPTCHA dependencies.

Thin wrappers around ``platform_shared`` services that close over app-local
``settings``. The scaffold has no public registration (single-user app) so the
Turnstile gate is only wired on forgot-password (for the admin operator).

Mirrors apps/myjobhunter/backend/app/core/rate_limit.py (name + thresholds only).
"""

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.rate_limit import (
    RateLimiter,
    make_check_account_not_locked,
    make_check_login_ip_limit,
    make_check_json_login_not_locked,
    make_require_turnstile,
)
from platform_shared.core.request_utils import get_client_ip
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
