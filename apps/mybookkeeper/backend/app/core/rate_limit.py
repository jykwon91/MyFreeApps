"""MBK rate-limit + login-throttle wrapper over :mod:`platform_shared.core.rate_limit`.

After PR M6 the pure token-bucket implementation, the per-IP login
throttle, the registration / password-reset / Turnstile gates, and the
account-lockout dependency all live in ``platform_shared``. This module
keeps the parts that legitimately depend on MBK config + MBK's user
repository:

  * pre-instantiated ``RateLimiter`` instances at MBK's policy thresholds
    (``login``: 10 / 5 min, ``register``: 5 / 1 h, etc.)
  * thin dependency bodies that close over MBK-local symbols
    (``verify_turnstile_token``, ``get_user_by_email``)
    so existing tests can keep monkeypatching them via
    ``patch("app.core.rate_limit.<symbol>", ...)``
  * ``settings.turnstile_secret_key`` lookup is lazy so
    ``patch.object(settings, "turnstile_secret_key", "...")`` still
    works during a single request.

Existing call sites inside MBK (``app.main``, ``app.api.totp``, route
gates, tests) keep their imports — every public name from before M6
still resolves here.
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
from platform_shared.services.turnstile_service import verify_turnstile_token

from app.core.config import settings
from app.core.request_utils import get_client_ip
from app.db.session import get_db
# Case-insensitive like fastapi-users, or changing one letter's case gets past the lock check.
from app.repositories.user.user_repo import get_by_email_ci as get_user_by_email


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
    "utility_plan_extract_limiter",
    "insurance_policy_extract_limiter",
    "mortgage_statement_extract_limiter",
    "utility_offer_search_limiter",
    "frontend_error_limiter",
    "require_turnstile",
    "check_login_rate_limit",
    "check_totp_rate_limit",
    "check_password_reset_rate_limit",
    "check_register_rate_limit",
    "check_account_not_locked",
    "check_totp_account_not_locked",
]


# ---------------------------------------------------------------------------
# MBK rate-limit policy — pre-instantiated limiters
# ---------------------------------------------------------------------------

login_limiter = RateLimiter(max_attempts=10, window_seconds=300)
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
password_reset_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
export_limiter = RateLimiter(max_attempts=20, window_seconds=3600)
# Above what working through a day's applicants takes, re-hiding included.
reveal_limiter = RateLimiter(max_attempts=60, window_seconds=3600)
# Each call is a paid model request against a document the caller already has.
# The daily upload cap bounds how many distinct documents exist but not how
# many times one is re-read, so this bounds the re-reads.
utility_plan_extract_limiter = RateLimiter(max_attempts=30, window_seconds=3600)
# Same reasoning for the declarations page a policy is read off. Its own bucket
# rather than a shared one so a morning spent re-reading Electricity Facts
# Labels cannot lock the operator out of recording an insurance policy.
insurance_policy_extract_limiter = RateLimiter(max_attempts=30, window_seconds=3600)
# And again for a mortgage statement. Its own bucket for the same reason: these
# arrive in a batch — one statement per property, all mailed the same week — so
# a session spent recording loans must not spend the insurance allowance.
mortgage_statement_extract_limiter = RateLimiter(max_attempts=30, window_seconds=3600)
# Each search fans out to one Power to Choose request per distinct property ZIP.
# The client's 15-minute cache absorbs ordinary page views, so this only bounds
# a caller deliberately hammering the PUCT host through us.
utility_offer_search_limiter = RateLimiter(max_attempts=60, window_seconds=3600)
frontend_error_limiter = RateLimiter(max_attempts=50, window_seconds=3600)


# ---------------------------------------------------------------------------
# FastAPI dependencies
#
# Limiters go to the shared factories directly; to change one in a test, patch its
# ``check``. Symbols tests replace on this module (``verify_turnstile_token``,
# ``get_user_by_email``, ``settings``) are looked up when the dependency runs.
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


async def check_password_reset_rate_limit(request: Request) -> None:
    password_reset_limiter.check(get_client_ip(request))


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


async def check_register_rate_limit(request: Request) -> None:
    register_limiter.check(get_client_ip(request))
    await require_turnstile(request)


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
