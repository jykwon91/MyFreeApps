"""In-memory rate limiter and login-throttle factories.

Two layers live here:

1. ``RateLimiter`` — a pure token-bucket implementation (no settings, no DB,
   no logger). The 429 it raises uses the shared ``RATE_LIMIT_GENERIC_DETAIL``
   so per-IP, account-lockout, and registration-rate gates all return a
   byte-identical response body. Any divergence would let an attacker
   probe whether a target account is currently locked.

2. ``make_*`` factories — return FastAPI dependencies. Each app provides
   its own thresholds, secret key, user-lookup callable, and (where
   applicable) auth-event logger when wiring the factory into its own
   thin ``app/core/rate_limit.py`` wrapper. The shared module deliberately
   does NOT import any app's ``settings``, repositories, or session
   factory.

In-process state — ``_buckets`` is a module-local dict on each
``RateLimiter`` instance, so the limiter is per-worker. Multi-worker /
multi-host coordination (Redis backend) is intentionally out of scope.
"""
import time
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from fastapi import HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.request_utils import get_client_ip
from platform_shared.services.auth_event_service import log_auth_event
from platform_shared.services.turnstile_service import verify_turnstile_token


# ---------------------------------------------------------------------------
# RateLimiter — pure token bucket, no app-specific deps
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class _BucketConfig:
    max_attempts: int
    window_seconds: int


@dataclass
class _Bucket:
    timestamps: list[float] = field(default_factory=list)


class RateLimiter:
    """Per-key sliding-window rate limiter.

    Usage::

        limiter = RateLimiter(max_attempts=10, window_seconds=300)
        limiter.check("client-ip-or-key")  # raises HTTPException(429) on over-limit

    The 429 ``detail`` is intentionally generic
    (``RATE_LIMIT_GENERIC_DETAIL``) so callers cannot distinguish which
    gate fired.
    """

    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self._config = _BucketConfig(max_attempts, window_seconds)
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def _cleanup_bucket(self, bucket: _Bucket, now: float) -> None:
        cutoff = now - self._config.window_seconds
        bucket.timestamps = [t for t in bucket.timestamps if t > cutoff]

    def check(self, key: str) -> None:
        """Record an attempt and raise 429 if over limit."""
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket()
                self._buckets[key] = bucket
            self._cleanup_bucket(bucket, now)
            if len(bucket.timestamps) >= self._config.max_attempts:
                raise HTTPException(
                    status_code=429,
                    detail=RATE_LIMIT_GENERIC_DETAIL,
                )
            bucket.timestamps.append(now)

            # Periodic cleanup of stale keys to bound memory.
            if len(self._buckets) > 100:
                stale_keys = [
                    k for k, b in self._buckets.items()
                    if not b.timestamps or b.timestamps[-1] < now - self._config.window_seconds
                ]
                for k in stale_keys:
                    del self._buckets[k]


# ---------------------------------------------------------------------------
# PII-safe email domain extractor
# ---------------------------------------------------------------------------

def email_domain_from_request(request: Request) -> Optional[str]:
    """Best-effort read of the submitted email domain from a login request.

    Pulled from ``request.state.login_email`` if a higher layer (e.g. an
    upstream dependency) chose to stash it there. Returns ``None`` when
    nothing is available — we never parse the body here, because the
    dependency runs before FastAPI binds the route's body parameters and
    consuming the stream would leave the route handler with an empty body.

    Never returns the full email — only the domain — so this stays PII-safe.
    """
    raw = getattr(request.state, "login_email", None)
    if not isinstance(raw, str) or "@" not in raw:
        return None
    return raw.split("@", 1)[-1].lower() or None


# ---------------------------------------------------------------------------
# Type aliases for factory parameters
# ---------------------------------------------------------------------------

# Lazy provider so callers can dynamically swap their secret-key value
# (e.g. ``patch.object(settings, "turnstile_secret_key", "...")`` in tests).
SecretKeyProvider = Callable[[], str]

# (db, email) -> User-like row or None. Returning Any means the shared
# module doesn't depend on any app's User model — it just reads
# ``locked_until`` off the result.
UserLookup = Callable[[AsyncSession, str], Awaitable[Any]]


# ---------------------------------------------------------------------------
# Turnstile factory
# ---------------------------------------------------------------------------

def make_require_turnstile(
    secret_key_provider: SecretKeyProvider,
    *,
    verify: Callable[..., Awaitable[bool]] = verify_turnstile_token,
) -> Callable[[Request], Awaitable[None]]:
    """Build a FastAPI dependency that enforces Turnstile CAPTCHA.

    The returned dependency is a no-op when ``secret_key_provider()`` is
    empty (dev / CI mode), matching MyBookkeeper's pre-PR-M6 behaviour.
    """

    async def _require_turnstile(request: Request) -> None:
        secret_key = secret_key_provider()
        if not secret_key:
            return
        token = request.headers.get("X-Turnstile-Token", "")
        if not token:
            raise HTTPException(status_code=400, detail="Captcha token required")
        valid = await verify(
            token,
            get_client_ip(request),
            secret_key=secret_key,
        )
        if not valid:
            raise HTTPException(status_code=400, detail="Captcha verification failed")

    return _require_turnstile


# ---------------------------------------------------------------------------
# Per-IP login throttle factory (with auth-event audit on block)
# ---------------------------------------------------------------------------

def make_check_login_ip_limit(
    limiter: RateLimiter,
    *,
    log_event: Callable[..., Awaitable[None]] = log_auth_event,
) -> Callable[[Request, AsyncSession], Awaitable[None]]:
    """Build the per-IP login dependency that audits every block.

    The returned dependency reads the client IP, hits ``limiter.check``,
    and on block writes a ``LOGIN_BLOCKED_RATE_LIMIT`` row to
    ``auth_events`` (via ``log_event``) before re-raising the 429. This
    means SOC / admin tooling can spot credential-stuffing patterns.

    The 429 body is the shared ``RATE_LIMIT_GENERIC_DETAIL`` — identical
    to the account-lockout body, so a caller cannot infer which gate
    fired.
    """

    async def _check_login_ip_limit(
        request: Request,
        db: AsyncSession,
    ) -> None:
        ip = get_client_ip(request)
        try:
            limiter.check(ip)
        except HTTPException:
            metadata: dict[str, str] = {"ip": ip}
            domain = email_domain_from_request(request)
            if domain is not None:
                metadata["email_domain"] = domain
            await log_event(
                db,
                event_type=AuthEventType.LOGIN_BLOCKED_RATE_LIMIT,
                user_id=None,
                request=request,
                succeeded=False,
                metadata=metadata,
            )
            await db.commit()
            raise

    return _check_login_ip_limit


# ---------------------------------------------------------------------------
# Account-lockout factory (early-reject before password check)
# ---------------------------------------------------------------------------

def make_check_account_not_locked(
    user_lookup: UserLookup,
) -> Callable[[OAuth2PasswordRequestForm, AsyncSession], Awaitable[None]]:
    """Build the account-lockout dependency.

    Runs BEFORE the password check so a locked account is rejected
    without revealing password correctness, and without further
    incrementing the failure counter (the counter is only incremented
    inside ``UserManager.authenticate`` on a real password failure).

    ``user_lookup`` is the app's own repository function — typically
    ``user_repo.get_by_email`` — passed in to avoid coupling this
    module to any app's User model.

    On block, raises 429 with the shared ``RATE_LIMIT_GENERIC_DETAIL``
    so the response is byte-identical to per-IP and registration gates.
    """

    async def _check_account_not_locked(
        credentials: OAuth2PasswordRequestForm,
        db: AsyncSession,
    ) -> None:
        user = await user_lookup(db, credentials.username)
        if user is None:
            # Unknown email — let the normal auth flow handle it (timing-safe).
            return
        locked_until = getattr(user, "locked_until", None)
        if locked_until and locked_until > datetime.now(tz=timezone.utc):
            raise HTTPException(
                status_code=429,
                detail=RATE_LIMIT_GENERIC_DETAIL,
            )

    return _check_account_not_locked
