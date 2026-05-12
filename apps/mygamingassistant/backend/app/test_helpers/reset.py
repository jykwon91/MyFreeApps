"""Test-only rate-limit reset endpoint.

Clears the in-memory login rate-limit buckets so E2E tests don't trip
throttling when many tests share 127.0.0.1 as the client IP.
"""
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.rate_limit import login_limiter, totp_limiter

router = APIRouter()


def _require_test_mode() -> None:
    if not settings.mga_enable_test_helpers:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/reset-rate-limit")
async def reset_rate_limit() -> dict[str, str]:
    """Clear per-IP login + TOTP rate-limit buckets.

    Only available when MGA_ENABLE_TEST_HELPERS=1. Returns 404 in production.
    """
    _require_test_mode()
    # Clear internal bucket dicts — thread-safe via the limiter's lock.
    with login_limiter._lock:
        login_limiter._buckets.clear()
    with totp_limiter._lock:
        totp_limiter._buckets.clear()
    return {"status": "cleared"}
