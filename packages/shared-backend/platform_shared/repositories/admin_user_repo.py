"""Generic, model-parametrized data access for admin user-management.

Each function takes the app's User class as the ``user_model`` argument
so this module stays decoupled from any specific app. Both apps'
``app.models.user.user.User`` classes inherit from
``SQLAlchemyBaseUserTableUUID`` and expose the same column set the
admin endpoints touch (``id``, ``email``, ``role``, ``is_active``,
``is_superuser``, ``is_verified``).
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

TUser = TypeVar("TUser")


async def list_all(db: AsyncSession, user_model: type[TUser]) -> Sequence[TUser]:
    """Return every user in the table, ordered by email."""
    result = await db.execute(select(user_model).order_by(user_model.email))
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession, user_model: type[TUser], user_id: uuid.UUID,
) -> TUser | None:
    """Return one user or None."""
    result = await db.execute(select(user_model).where(user_model.id == user_id))
    return result.scalar_one_or_none()


async def update_role(db: AsyncSession, user: Any, role: Any) -> Any:
    """In-place role update. Caller is responsible for the surrounding transaction."""
    user.role = role
    return user


async def set_active(db: AsyncSession, user: Any, *, is_active: bool) -> Any:
    """In-place is_active update."""
    user.is_active = is_active
    return user


async def set_superuser(db: AsyncSession, user: Any, *, is_superuser: bool) -> Any:
    """In-place is_superuser update."""
    user.is_superuser = is_superuser
    return user


async def count_users(
    db: AsyncSession, user_model: type[TUser],
) -> tuple[int, int, int]:
    """Return (total, active, inactive) user counts."""
    result = await db.execute(
        select(
            func.count(user_model.id),
            func.count(user_model.id).filter(user_model.is_active.is_(True)),
            func.count(user_model.id).filter(user_model.is_active.is_(False)),
        )
    )
    row = result.one()
    return int(row[0]), int(row[1]), int(row[2])
