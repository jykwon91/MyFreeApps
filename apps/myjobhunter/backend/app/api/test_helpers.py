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
