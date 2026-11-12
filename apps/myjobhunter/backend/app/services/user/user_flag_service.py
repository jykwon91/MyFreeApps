"""Test-helper user-flag service — owns the transaction boundary."""
from typing import Literal

from app.db.session import AsyncSessionLocal
from app.repositories.user import user_repo


async def set_flag_by_email(email: str, flag: Literal["is_verified", "is_superuser"]) -> bool:
    """Set a boolean user flag TRUE by email. Returns False when no user matches."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            return await user_repo.set_flag_by_email(session, email, flag)
