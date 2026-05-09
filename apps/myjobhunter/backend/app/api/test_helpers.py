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
    """Flip a user's ``is_superuser`` flag to True.

    Used by E2E tests that exercise admin-gated routes (e.g.
    ``/admin/demo/users``) so a fresh test user can be granted the
    superuser bit without seeding via SQL. Gated by
    ``MYJOBHUNTER_ENABLE_TEST_HELPERS=1`` — never mounted in production.

    The admin gate (``app.core.permissions.current_superuser``) reads
    ``user.is_superuser``, so this is the column we flip. The legacy
    ``role`` column on the user model is platform-level metadata and
    is NOT what gates admin routes.

    Caller ordering note: callers must promote AFTER any login the user
    will perform during the test. fastapi-users' ``UserManager`` issues
    an ORM ``user_db.update(...)`` on successful login flows, which can
    overwrite a fresh promotion with the in-memory user copy that still
    has ``is_superuser=False``. Promote last; subsequent requests use
    the existing JWT and read ``is_superuser`` fresh from the DB on
    every authenticated request.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text(
                    "UPDATE users SET is_superuser = TRUE "
                    "WHERE email = :email RETURNING id"
                ),
                {"email": email},
            )
            row = result.first()
        if row is None:
            raise HTTPException(status_code=404, detail="user not found")
