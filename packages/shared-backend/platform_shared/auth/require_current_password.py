"""Ask a signed-in user for their password again before a sensitive change."""
from fastapi import HTTPException, Request

from platform_shared.auth.refuse_as_locked import refuse_as_locked
from platform_shared.auth.totp_route_user import TotpRouteUser
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.services.guard_outcome import GuardOutcome


async def require_current_password(
    *,
    password: str,
    user: TotpRouteUser,
    user_manager: PlatformBaseUserManager,
    request: Request,
) -> None:
    """Raise unless ``password`` is right. Wrong ones count toward the login lockout,
    or a stolen token could guess the password without limit. A right one clears nothing,
    since the change it was asked for hasn't happened yet.
    """
    guard = user_manager.account_guard
    if await guard.begin_attempt(user.id, request=request) is GuardOutcome.LOCKED:
        refuse_as_locked()

    verified, _ = user_manager.password_helper.verify_and_update(password, user.hashed_password)
    outcome = await guard.record_password_attempt(
        user.id, correct=verified, finishes_login=False, request=request,
    )
    if outcome is GuardOutcome.LOCKED:
        refuse_as_locked()
    if outcome is GuardOutcome.WRONG:
        raise HTTPException(status_code=403, detail="Incorrect password")
