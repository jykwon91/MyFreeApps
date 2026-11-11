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

from app.api import admin_invites, applications, companies, discover, resume_refinement, resumes
from app.core import rate_limit as rl
from app.core.rate_limit import RateLimiter
from app.db.session import AsyncSessionLocal

router = APIRouter()


def _all_limiters() -> tuple[RateLimiter, ...]:
    """Every module-level limiter, looked up at call time (tests may swap them)."""
    return (
        rl.login_limiter,
        rl.totp_limiter,
        admin_invites._INVITE_INFO_LIMITER,
        applications._JD_PARSE_LIMITER,
        applications._JD_URL_EXTRACT_LIMITER,
        applications._TRANSITION_LIMITER_PER_MIN,
        applications._TRANSITION_LIMITER_PER_HOUR,
        applications._NOTES_PATCH_LIMITER_PER_MIN,
        applications._NOTES_PATCH_LIMITER_PER_HOUR,
        companies._RESEARCH_LIMITER_PER_5_MIN,
        companies._RESEARCH_LIMITER_PER_HOUR,
        discover._REFRESH_LIMITER,
        resume_refinement._PREPARE_LIMITER,
        resume_refinement._TURN_LIMITER_PER_5_MIN,
        resume_refinement._TURN_LIMITER_PER_HOUR,
        resumes._UPLOAD_LIMITER,
    )


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

    Lets E2E tests reset every limiter (login, TOTP, and the per-user AI
    endpoint budgets) between runs without restarting the server.
    """
    for limiter in _all_limiters():
        limiter.reset()


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
