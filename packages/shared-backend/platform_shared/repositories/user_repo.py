"""User-row reads parameterized on the per-app User model.

Each app's own ``User`` class differs in domain columns (MBK has
``role``/``name``, MJH has ``display_name``/``is_demo``), but the two
canonical lookups — by id, by email — share the same shape
across every app. Apps thin-wrap these and bind their own User class.

Usage in ``apps/<app>/backend/app/repositories/user/user_repo.py``:

    from platform_shared.repositories.user_repo import (
        get_by_id as _shared_get_by_id,
        get_by_email as _shared_get_by_email,
    )
    from app.models.user.user import User

    async def get_by_id(db, user_id):
        return await _shared_get_by_id(db, user_id, user_model=User)

    # ... same for get_by_email
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.permissions import Role


async def get_by_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    user_model: Any,
) -> Any | None:
    """Return the user row with ``user_id``, or ``None`` if not found."""
    result = await db.execute(select(user_model).where(user_model.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(
    db: AsyncSession,
    email: str,
    *,
    user_model: Any,
) -> Any | None:
    """Return the user row with ``email``, or ``None`` if not found."""
    result = await db.execute(select(user_model).where(user_model.email == email))
    return result.scalar_one_or_none()


async def get_by_email_ci(
    db: AsyncSession,
    email: str,
    *,
    user_model: Any,
) -> Any | None:
    """Case-insensitive email lookup.

    Matches fastapi-users' own ``get_by_email`` semantics — used by the
    boot-time admin seed so a case-variant of the configured address can't
    slip past the ownership check (``seed_admin_service``).
    """
    result = await db.execute(
        select(user_model).where(
            func.lower(user_model.email) == (email or "").strip().lower()
        )
    )
    return result.scalars().first()


async def create_seed_admin(
    db: AsyncSession,
    *,
    user_model: Any,
    email: str,
    hashed_password: str,
) -> Any:
    """Insert the boot-seeded platform admin (verified, role=admin,
    is_superuser). Called only when no row matches the seed email —
    ownership/promotion policy lives in ``seed_admin_service``."""
    user = user_model(
        email=email,
        hashed_password=hashed_password,
        is_active=True,
        is_superuser=True,
        is_verified=True,  # operator's own address — no verification email needed
        role=Role.ADMIN,
    )
    db.add(user)
    await db.flush()
    return user


async def apply_seed_admin_promotion(
    db: AsyncSession,
    user: Any,
    updates: dict[str, Any],
) -> None:
    """Apply the seed-owned promotion field updates and flush."""
    for field, value in updates.items():
        setattr(user, field, value)
    await db.flush()


async def lock_by_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    user_model: Any,
) -> Any | None:
    """Return the user row with ``user_id``, locked until the transaction ends.

    Reads current values even if this session already loaded the user.
    """
    result = await db.execute(_locked_select(user_model).where(user_model.id == user_id))
    return result.scalar_one_or_none()


async def lock_by_email(
    db: AsyncSession,
    email: str,
    *,
    user_model: Any,
) -> Any | None:
    """Return the user row with ``email``, locked until the transaction ends."""
    result = await db.execute(_locked_select(user_model).where(user_model.email == email))
    return result.scalar_one_or_none()


def _locked_select(user_model: Any) -> Any:
    return (
        select(user_model)
        .with_for_update(of=user_model)
        .execution_options(populate_existing=True)
    )
