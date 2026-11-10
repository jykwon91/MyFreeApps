"""Shared DailyUsageCounter model — a durable per-bucket, per-UTC-day counter.

Backs ``platform_shared.repositories.daily_quota_repo.try_consume_daily_quota``,
the global daily cap for cost-bearing public endpoints (e.g. a Claude call
reachable without auth). In-process limiters (``RateLimiter``) reset on restart
and are per-worker; this counter lives in the app's database, so the cap holds
across restarts and across every uvicorn worker.

Opt-in: this model is deliberately NOT exported from
``platform_shared.db.models`` — an app that needs a daily cap imports it in its
own ``app.models`` package and provisions the table in its own Alembic
migration (same ownership shape as ``auth_events`` / ``audit_logs``).

Rows are tiny (one per bucket per day) and never updated after their day ends;
nothing reads a past day, so old days are dead weight an app may prune. A bucket
that embeds a user id (``app:user:<id>``) is removed with
``daily_quota_repo.delete_daily_usage_for_bucket`` when that user's account is
deleted - the key is a plain string, so no foreign key cascades to it.
"""
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.db.base import Base


class DailyUsageCounter(Base):
    __tablename__ = "daily_usage_counters"

    # Composite PK (bucket, day) — the upsert conflict target.
    bucket: Mapped[str] = mapped_column(String(100), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
