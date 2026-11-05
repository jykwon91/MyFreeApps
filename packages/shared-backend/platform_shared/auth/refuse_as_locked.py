"""The answer a signed-in request gets when its account is locked."""
from typing import NoReturn

from fastapi import HTTPException

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL


def refuse_as_locked() -> NoReturn:
    """Raise the same 429 every rate limit and lockout gives."""
    raise HTTPException(status_code=429, detail=RATE_LIMIT_GENERIC_DETAIL)
