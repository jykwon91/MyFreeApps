"""MyJobHunter wrapper over :mod:`platform_shared.core.rate_limit` (PR C3).

Builds the per-IP login limiter and the account-lockout dependency from
the shared M6 factories. Each app owns its own thresholds + user-lookup
callable; the shared module deliberately does not import any app's
``settings`` or repositories.

Existing tests can keep monkeypatching the module-level symbols
(``login_limiter``, ``get_user_by_email``) via
``patch("app.core.rate_limit.<symbol>", ...)`` — we deliberately re-bind
the dependencies to the module-level names so those patches still take
effect on the next request.

Future PRs (Turnstile / register-rate / password-reset) will extend this
file; the C1 worktree may already be doing that in parallel. The merge
resolution is: keep both wrappers in this single module.
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
)
from platform_shared.core.request_utils import get_client_ip

from app.core.config import settings
from app.db.session import get_db
from app.repositories.user.user_repo import get_by_email as get_user_by_email
from app.services.system.auth_event_service import log_auth_event


__all__ = [
    "RateLimiter",
    "RATE_LIMIT_GENERIC_DETAIL",
    "get_user_by_email",
    "login_limiter",
    "check_login_rate_limit",
    "check_account_not_locked",
]


# ---------------------------------------------------------------------------
# MJH rate-limit policy — pre-instantiated limiters
# ---------------------------------------------------------------------------

login_limiter = RateLimiter(
    max_attempts=settings.login_rate_limit_threshold,
    window_seconds=settings.login_rate_limit_window_seconds,
)


# ---------------------------------------------------------------------------
# FastAPI dependencies
#
# Each dependency body deliberately references the *module-level* symbols
# (``login_limiter``, ``get_user_by_email``) so that existing tests using
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
