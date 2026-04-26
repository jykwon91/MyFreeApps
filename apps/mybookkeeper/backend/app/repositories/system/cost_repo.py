"""Repository for cost-related database queries."""
from datetime import datetime

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.platform_settings import PlatformSettings
from app.models.system.system_event import SystemEvent
from app.models.system.usage_log import UsageLog
from app.models.user.user import User


async def get_platform_settings(db: AsyncSession) -> PlatformSettings | None:
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == 1))
    return result.scalar_one_or_none()


async def aggregate_cost(db: AsyncSession, since: datetime) -> dict:
    """Return total input_sum, output_sum, tokens_sum, count since the given datetime."""
    stmt = select(
        func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_sum"),
        func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_sum"),
        func.coalesce(func.sum(UsageLog.tokens), 0).label("tokens_sum"),
        func.count().label("count"),
    ).where(UsageLog.created_at >= since)
    result = await db.execute(stmt)
    row = result.one()
    return {
        "input_sum": row.input_sum,
        "output_sum": row.output_sum,
        "tokens_sum": row.tokens_sum,
        "count": row.count,
    }


async def get_usage_by_user(db: AsyncSession, since: datetime, limit: int = 20) -> list:
    """Return per-user aggregated usage rows since the given datetime."""
    stmt = (
        select(
            UsageLog.user_id,
            User.email,
            func.sum(UsageLog.input_tokens).label("input_sum"),
            func.sum(UsageLog.output_tokens).label("output_sum"),
            func.sum(UsageLog.tokens).label("tokens_sum"),
            func.count().label("count"),
        )
        .join(User, User.id == UsageLog.user_id)
        .where(UsageLog.created_at >= since)
        .group_by(UsageLog.user_id, User.email)
        .order_by(func.sum(UsageLog.tokens).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.all()


async def get_daily_usage(db: AsyncSession, since: datetime) -> list:
    """Return per-day aggregated usage rows since the given datetime."""
    stmt = (
        select(
            cast(UsageLog.created_at, Date).label("day"),
            func.sum(UsageLog.input_tokens).label("input_sum"),
            func.sum(UsageLog.output_tokens).label("output_sum"),
            func.sum(UsageLog.tokens).label("tokens_sum"),
            func.count().label("count"),
        )
        .where(UsageLog.created_at >= since)
        .group_by(cast(UsageLog.created_at, Date))
        .order_by(cast(UsageLog.created_at, Date))
    )
    result = await db.execute(stmt)
    return result.all()


async def get_unresolved_cost_alerts(db: AsyncSession) -> list[SystemEvent]:
    """Return unresolved cost_alert system events, newest first."""
    stmt = (
        select(SystemEvent)
        .where(
            SystemEvent.event_type == "cost_alert",
            SystemEvent.resolved == False,  # noqa: E712
        )
        .order_by(SystemEvent.created_at.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


_API_TO_DB_COLUMN: dict[str, str] = {
    "daily_budget": "cost_daily_budget",
    "monthly_budget": "cost_monthly_budget",
    "per_user_daily_alert": "cost_per_user_daily_alert",
    "input_rate_per_million": "cost_input_rate_per_million",
    "output_rate_per_million": "cost_output_rate_per_million",
}


async def upsert_platform_settings(db: AsyncSession, updates: dict) -> PlatformSettings:
    """Upsert PlatformSettings row id=1 with the provided field updates.

    `updates` keys are API field names (e.g. "daily_budget"); they are mapped
    to the corresponding DB column names before being applied.
    Must be called inside an active unit_of_work transaction.
    """
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == 1))
    cfg = result.scalar_one_or_none()
    if cfg is None:
        cfg = PlatformSettings(id=1)
        db.add(cfg)
    for key, value in updates.items():
        db_column = _API_TO_DB_COLUMN.get(key)
        if db_column:
            setattr(cfg, db_column, value)
    await db.flush()
    return cfg
