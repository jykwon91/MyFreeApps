"""In-memory rate limiter for auth and API endpoints.

Uses a simple dict with TTL cleanup. Suitable for single-server deployments.
"""
import time
import threading
from dataclasses import dataclass, field

from fastapi import HTTPException, Request

from app.core.config import settings
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
                    detail="Too many requests. Please try again later.",
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


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


login_limiter = RateLimiter(max_attempts=10, window_seconds=300)
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
password_reset_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
export_limiter = RateLimiter(max_attempts=20, window_seconds=3600)
frontend_error_limiter = RateLimiter(max_attempts=50, window_seconds=3600)


async def check_login_rate_limit(request: Request) -> None:
    login_limiter.check(_get_client_ip(request))


async def check_totp_rate_limit(request: Request) -> None:
    totp_limiter.check(_get_client_ip(request))


async def check_password_reset_rate_limit(request: Request) -> None:
    password_reset_limiter.check(_get_client_ip(request))


async def check_register_rate_limit(request: Request) -> None:
    register_limiter.check(_get_client_ip(request))

    if settings.turnstile_secret_key:
        token = request.headers.get("X-Turnstile-Token", "")
        if not token:
            raise HTTPException(status_code=400, detail="Captcha token required")
        valid = await verify_turnstile_token(token, _get_client_ip(request))
        if not valid:
            raise HTTPException(status_code=400, detail="Captcha verification failed")
