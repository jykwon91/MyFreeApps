"""Reads and writes for an app's ``RefreshSession`` model."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession


def add(db: AsyncSession, session: Any) -> None:
    db.add(session)


def _locked_select(session_model: type[Any], session_id: uuid.UUID) -> Any:
    return (
        select(session_model)
        .where(session_model.id == session_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def lock_by_id(
    db: AsyncSession, session_model: type[Any], session_id: uuid.UUID,
) -> Any | None:
    """Load a session and hold its row, so parallel refreshes run one at a time."""
    return (await db.execute(_locked_select(session_model, session_id))).scalar_one_or_none()


async def list_for_user(
    db: AsyncSession, session_model: type[Any], user_id: uuid.UUID,
) -> Sequence[Any]:
    statement = (
        select(session_model)
        .where(session_model.user_id == user_id)
        .order_by(session_model.last_used_at.desc())
    )
    return (await db.execute(statement)).scalars().all()


async def delete_owned(
    db: AsyncSession, session_model: type[Any], user_id: uuid.UUID, session_id: uuid.UUID,
) -> bool:
    """Delete a session only if it belongs to this user."""
    result = await db.execute(
        delete(session_model).where(
            session_model.id == session_id, session_model.user_id == user_id,
        )
    )
    return result.rowcount > 0


async def delete_session(db: AsyncSession, session: Any) -> None:
    await db.delete(session)


async def delete_expired_for_user(
    db: AsyncSession,
    session_model: type[Any],
    user_id: uuid.UUID,
    *,
    now: datetime,
    last_used_before: datetime,
) -> None:
    await db.execute(
        delete(session_model).where(
            session_model.user_id == user_id,
            or_(
                session_model.expires_at <= now,
                session_model.last_used_at <= last_used_before,
            ),
        )
    )

async def delete_all_but_newest(
    db: AsyncSession, session_model: type[Any], user_id: uuid.UUID, *, keep: int,
) -> None:
    surplus = (
        select(session_model.id)
        .where(session_model.user_id == user_id)
        .order_by(session_model.last_used_at.desc())
        .offset(keep)
    )
    await db.execute(delete(session_model).where(session_model.id.in_(surplus)))


async def delete_by_id(db: AsyncSession, session_model: type[Any], session_id: uuid.UUID) -> None:
    await db.execute(delete(session_model).where(session_model.id == session_id))


__all__ = ["add", "delete_all_but_newest",
    "delete_by_id",
    "delete_expired_for_user", "delete_owned", "delete_session", "list_for_user", "lock_by_id"]
