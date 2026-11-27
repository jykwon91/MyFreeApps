"""Savings ideas: the page's open list, and the rows a research run updates by key."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.savings_enums import IDEA_STATUS_OPEN
from app.models.savings.savings_idea import SavingsIdea


def _owned(organization_id: uuid.UUID, user_id: uuid.UUID) -> list:
    return [SavingsIdea.organization_id == organization_id, SavingsIdea.user_id == user_id]


async def list_open(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    confirmed_since: _dt.datetime,
    today: _dt.date,
) -> list[SavingsIdea]:
    """Open ideas a run re-confirmed since ``confirmed_since`` whose offer hasn't
    expired, biggest saving first."""
    result = await db.execute(
        select(SavingsIdea)
        .where(
            *_owned(organization_id, user_id),
            SavingsIdea.status == IDEA_STATUS_OPEN,
            SavingsIdea.last_confirmed_at >= confirmed_since,
            or_(SavingsIdea.expires_on.is_(None), SavingsIdea.expires_on >= today),
        )
        .order_by(desc(SavingsIdea.savings_high_cents), desc(SavingsIdea.savings_low_cents), SavingsIdea.title)
    )
    return list(result.scalars().all())


async def get_by_keys(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID, keys: list[str],
) -> dict[str, SavingsIdea]:
    """Every idea of this person's with one of ``keys``, whatever its status."""
    if not keys:
        return {}
    result = await db.execute(
        select(SavingsIdea).where(*_owned(organization_id, user_id), SavingsIdea.idea_key.in_(keys))
    )
    return {idea.idea_key: idea for idea in result.scalars().all()}


async def get(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID, idea_id: uuid.UUID,
) -> SavingsIdea | None:
    result = await db.execute(
        select(SavingsIdea).where(*_owned(organization_id, user_id), SavingsIdea.id == idea_id)
    )
    return result.scalar_one_or_none()


async def add(db: AsyncSession, idea: SavingsIdea) -> SavingsIdea:
    db.add(idea)
    await db.flush()
    return idea


async def list_recent(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID, limit: int,
) -> list[SavingsIdea]:
    """This person's ideas in any status, most recently confirmed first."""
    result = await db.execute(
        select(SavingsIdea)
        .where(*_owned(organization_id, user_id))
        .order_by(desc(SavingsIdea.last_confirmed_at))
        .limit(limit)
    )
    return list(result.scalars().all())
