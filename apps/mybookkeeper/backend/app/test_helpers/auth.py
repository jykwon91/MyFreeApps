"""Test-only auth helpers: the test-mode gate guard and promotion endpoints."""

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import EmailStr

from app.core.auth import current_active_user
from app.core.config import settings
from app.core.rate_limit import login_limiter, password_reset_limiter, register_limiter, totp_limiter
from app.db.session import unit_of_work
from app.models.user.user import Role, User
from app.repositories.user import user_repo
from app.schemas.user.user import UserRead

router = APIRouter()


def _require_test_mode() -> None:
    if not settings.allow_test_admin_promotion:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/test/promote-admin", response_model=UserRead)
async def promote_to_admin(
    user: User = Depends(current_active_user),
) -> User:
    _require_test_mode()

    if user.role == Role.ADMIN:
        return user

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user.id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        await user_repo.update_role(db, target, Role.ADMIN)
        return target


@router.post("/test/promote-superuser", response_model=UserRead)
async def promote_to_superuser(
    user: User = Depends(current_active_user),
) -> User:
    """Make the caller a super admin, for E2E tests of the strict superuser gate.

    Granting it for real takes an existing super admin, so a fresh test account
    has no other way in.
    """
    _require_test_mode()

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user.id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        await user_repo.set_superuser(db, target, is_superuser=True)
        return target


@router.post("/test/verify-email", status_code=204)
async def force_verify_email(email: EmailStr = Body(..., embed=True)) -> None:
    """Mark a user verified, for E2E tests that need their own account."""
    _require_test_mode()

    async with unit_of_work() as db:
        target = await user_repo.get_by_email(db, email)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        target.is_verified = True


@router.post("/test/reset-auth-rate-limits", status_code=204)
async def reset_auth_rate_limits() -> None:
    """Clear the per-IP sign-in, sign-up and password-reset limits.

    Every E2E request comes from one IP, so without this a spec that signs in
    a few times uses up the allowance of the specs that follow it.
    """
    _require_test_mode()
    for limiter in (login_limiter, totp_limiter, register_limiter, password_reset_limiter):
        limiter.reset()
