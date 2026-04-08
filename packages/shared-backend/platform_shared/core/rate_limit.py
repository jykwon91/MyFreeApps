"""In-memory rate limiter for auth and API endpoints.

Uses a simple dict with TTL cleanup. Suitable for single-server deployments.

Usage:
    limiter = RateLimiter(max_attempts=10, window_seconds=300)
    limiter.check("user-ip-or-key")  # raises HTTPException(429) if over limit
"""
import time
import threading
from dataclasses import dataclass, field

from fastapi import HTTPException, Request


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

            if len(self._buckets) > 100:
                stale_keys = [
                    k for k, b in self._buckets.items()
                    if not b.timestamps or b.timestamps[-1] < now - self._config.window_seconds
                ]
                for k in stale_keys:
                    del self._buckets[k]


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
