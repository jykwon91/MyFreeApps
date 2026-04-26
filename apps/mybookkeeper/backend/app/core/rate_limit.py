"""In-memory rate limiter for auth and API endpoints.

Uses a simple dict with TTL cleanup. Suitable for single-server deployments.
"""
import time
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_events import AuthEventType
from app.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from app.core.config import settings
from app.core.request_utils import get_client_ip
from app.db.session import get_db
from app.repositories.user.user_repo import get_by_email as get_user_by_email
from app.services.system.auth_event_service import log_auth_event
from app.services.user.turnstile_service import verify_turnstile_token


@dataclass(slots=True)
class _BucketConfig:
    max_attempts: int
    window_seconds: int


@dataclass
class _Bucket:
    timestamps: list[float] = field(default_factory=list)


class RateLimiter:
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

            # Periodic cleanup of stale keys (every 100th call)
            if len(self._buckets) > 100:
                stale_keys = [
                    k for k, b in self._buckets.items()
                    if not b.timestamps or b.timestamps[-1] < now - self._config.window_seconds
                ]
                for k in stale_keys:
                    del self._buckets[k]


login_limiter = RateLimiter(max_attempts=10, window_seconds=300)
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
password_reset_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
export_limiter = RateLimiter(max_attempts=20, window_seconds=3600)
frontend_error_limiter = RateLimiter(max_attempts=50, window_seconds=3600)


def _email_domain_from_request(request: Request) -> str | None:
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
        domain = _email_domain_from_request(request)
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

    No-op when ``settings.turnstile_secret_key`` is empty (dev/CI mode),
    matching the behaviour of the registration flow.
    """
    if not settings.turnstile_secret_key:
        return
    token = request.headers.get("X-Turnstile-Token", "")
    if not token:
        raise HTTPException(status_code=400, detail="Captcha token required")
    valid = await verify_turnstile_token(token, get_client_ip(request))
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
