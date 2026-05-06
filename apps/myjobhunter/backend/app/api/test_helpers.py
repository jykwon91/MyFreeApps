"""Test-only helper endpoints.

These routes are mounted ONLY when the env var
`MYJOBHUNTER_ENABLE_TEST_HELPERS=1` is set — never in production. They exist
so the Playwright E2E suite can put the database into deterministic states
(e.g. flipping `is_verified=True` after registration) without parsing the
console-backend email log or threading verification tokens through the UI.
"""
from fastapi import APIRouter, Body, HTTPException
from pydantic import EmailStr
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.core import rate_limit as rl

router = APIRouter()


@router.post("/_test/verify-email", status_code=204)
async def force_verify_email(email: EmailStr = Body(..., embed=True)) -> None:
    """Mark a user verified — used by E2E tests to bypass the email link."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text(
                    "UPDATE users SET is_verified = TRUE "
                    "WHERE email = :email RETURNING id"
                ),
                {"email": email},
            )
            row = result.first()
        if row is None:
            raise HTTPException(status_code=404, detail="user not found")


@router.post("/_test/reset-rate-limit", status_code=204)
async def reset_rate_limit() -> None:
    """Clear all in-memory rate-limit buckets.

    Allows E2E tests to reset per-IP login throttle between test runs
    without restarting the server.

    Uses the internal ``_buckets`` dict directly (thread-safe via the
    limiter's own lock) because ``reset_all()`` may not be available in
    older platform_shared releases.
    """
    limiter = rl.login_limiter
    lock = getattr(limiter, "_lock", None)
    if lock is not None:
        with lock:
            getattr(limiter, "_buckets", {}).clear()
    else:
        # Fallback: no-op rather than crash
        pass


@router.post("/_test/promote-to-admin", status_code=204)
async def promote_to_admin(email: EmailStr = Body(..., embed=True)) -> None:
    """Flip a user's role to admin.

    Used by E2E tests that exercise admin-gated routes (e.g.
    ``/admin/demo/users``) so a fresh test user can be granted the
    role without seeding via SQL. Gated by
    ``MYJOBHUNTER_ENABLE_TEST_HELPERS=1`` — never mounted in production.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text(
                    "UPDATE users SET role = 'admin' "
                    "WHERE email = :email RETURNING id"
                ),
                {"email": email},
            )
            row = result.first()
        if row is None:
            raise HTTPException(status_code=404, detail="user not found")
