"""The per-person savings research on/off setting."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.savings.savings_research_setting import SavingsResearchSetting


async def get(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> SavingsResearchSetting | None:
    result = await db.execute(
        select(SavingsResearchSetting).where(
            SavingsResearchSetting.organization_id == organization_id,
            SavingsResearchSetting.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def set_enabled(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    enabled: bool,
    now: _dt.datetime,
) -> SavingsResearchSetting:
    """Turn research on or off, creating the row on first use."""
    setting = await get(db, organization_id=organization_id, user_id=user_id)
    if setting is None:
        setting = SavingsResearchSetting(organization_id=organization_id, user_id=user_id)
        db.add(setting)
    if enabled and not setting.enabled:
        setting.enabled_at = now
    setting.enabled = enabled
    await db.flush()
    return setting


async def list_enabled(db: AsyncSession) -> list[SavingsResearchSetting]:
    """Everyone with research on, across every workspace (the scheduler's list)."""
    result = await db.execute(
        select(SavingsResearchSetting)
        .where(SavingsResearchSetting.enabled.is_(True))
        .order_by(SavingsResearchSetting.created_at)
    )
    return list(result.scalars().all())
