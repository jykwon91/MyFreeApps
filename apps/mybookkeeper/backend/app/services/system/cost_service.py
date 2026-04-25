"""Cost monitoring service — aggregates API token costs from usage logs."""
import logging
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.system.platform_settings import PlatformSettings
from app.repositories.system import cost_repo
from app.schemas.system.cost import (
    CostAlert,
    CostSummary,
    CostThresholds,
    CostThresholdsUpdate,
    DailyCost,
    UserCost,
)
from app.services.system.event_service import record_event
from app.services.system.email_service import send_cost_alert

logger = logging.getLogger(__name__)


async def _get_settings() -> PlatformSettings:
    async with AsyncSessionLocal() as db:
        row = await cost_repo.get_platform_settings(db)
        if row:
            return row
    return PlatformSettings(
        cost_input_rate_per_million=settings.cost_input_rate_per_million,
        cost_output_rate_per_million=settings.cost_output_rate_per_million,
        cost_daily_budget=settings.cost_daily_budget,
        cost_monthly_budget=settings.cost_monthly_budget,
        cost_per_user_daily_alert=settings.cost_per_user_daily_alert,
    )


def _compute_cost(input_tokens: int, output_tokens: int, total_tokens: int, cfg: PlatformSettings) -> float:
    input_rate = float(cfg.cost_input_rate_per_million)
    output_rate = float(cfg.cost_output_rate_per_million)
    if input_tokens > 0 or output_tokens > 0:
        return (input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate
    return (total_tokens / 1_000_000) * output_rate


async def get_cost_summary() -> CostSummary:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    cfg = await _get_settings()
    async with AsyncSessionLocal() as db:
        today_data = await cost_repo.aggregate_cost(db, today_start)
        week_data = await cost_repo.aggregate_cost(db, week_start)
        month_data = await cost_repo.aggregate_cost(db, month_start)

    return CostSummary(
        today=_compute_cost(today_data["input_sum"], today_data["output_sum"], today_data["tokens_sum"], cfg),
        this_week=_compute_cost(week_data["input_sum"], week_data["output_sum"], week_data["tokens_sum"], cfg),
        this_month=_compute_cost(month_data["input_sum"], month_data["output_sum"], month_data["tokens_sum"], cfg),
        total_tokens_today=today_data["tokens_sum"],
        extractions_today=today_data["count"],
    )


async def get_cost_by_user(since: datetime, limit: int = 20) -> list[UserCost]:
    cfg = await _get_settings()
    async with AsyncSessionLocal() as db:
        rows = await cost_repo.get_usage_by_user(db, since, limit)

    return [
        UserCost(
            user_id=row.user_id,
            email=row.email,
            cost=_compute_cost(row.input_sum or 0, row.output_sum or 0, row.tokens_sum or 0, cfg),
            tokens=row.tokens_sum or 0,
            extractions=row.count,
        )
        for row in rows
    ]


async def get_cost_timeline(days: int = 30) -> list[DailyCost]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    cfg = await _get_settings()
    input_rate = float(cfg.cost_input_rate_per_million)
    output_rate = float(cfg.cost_output_rate_per_million)

    async with AsyncSessionLocal() as db:
        rows = await cost_repo.get_daily_usage(db, since)

    return [
        DailyCost(
            date=str(row.day),
            cost=_compute_cost(row.input_sum or 0, row.output_sum or 0, row.tokens_sum or 0, cfg),
            input_cost=(row.input_sum or 0) / 1_000_000 * input_rate,
            output_cost=(row.output_sum or 0) / 1_000_000 * output_rate,
            tokens=row.tokens_sum or 0,
            extractions=row.count,
        )
        for row in rows
    ]


async def get_thresholds() -> CostThresholds:
    cfg = await _get_settings()
    return CostThresholds(
        daily_budget=float(cfg.cost_daily_budget),
        monthly_budget=float(cfg.cost_monthly_budget),
        per_user_daily_alert=float(cfg.cost_per_user_daily_alert),
        input_rate_per_million=float(cfg.cost_input_rate_per_million),
        output_rate_per_million=float(cfg.cost_output_rate_per_million),
    )


async def update_thresholds(updates: CostThresholdsUpdate) -> CostThresholds:
    async with unit_of_work() as db:
        cfg = await cost_repo.upsert_platform_settings(db, updates.model_dump(exclude_unset=True))
        result = CostThresholds(
            daily_budget=float(cfg.cost_daily_budget),
            monthly_budget=float(cfg.cost_monthly_budget),
            per_user_daily_alert=float(cfg.cost_per_user_daily_alert),
            input_rate_per_million=float(cfg.cost_input_rate_per_million),
            output_rate_per_million=float(cfg.cost_output_rate_per_million),
        )
    return result


async def get_active_alerts() -> list[CostAlert]:
    async with AsyncSessionLocal() as db:
        rows = await cost_repo.get_unresolved_cost_alerts(db)

    return [
        CostAlert(
            id=row.id,
            severity=row.severity,
            message=row.message,
            event_data=row.event_data,
            created_at=row.created_at,
        )
        for row in rows
    ]


async def check_cost_alerts(organization_id=None) -> None:
    try:
        cfg = await _get_settings()
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = today_start.replace(day=1)

        async with AsyncSessionLocal() as db:
            today_data = await cost_repo.aggregate_cost(db, today_start)
            month_data = await cost_repo.aggregate_cost(db, month_start)

        today_cost = _compute_cost(today_data["input_sum"], today_data["output_sum"], today_data["tokens_sum"], cfg)
        month_cost = _compute_cost(month_data["input_sum"], month_data["output_sum"], month_data["tokens_sum"], cfg)
        daily_budget = float(cfg.cost_daily_budget)
        monthly_budget = float(cfg.cost_monthly_budget)

        if today_cost >= daily_budget:
            msg = f"Daily API cost ${today_cost:.2f} exceeds budget ${daily_budget:.2f}"
            await record_event(
                organization_id, "cost_alert", "warning", msg,
                {"daily_cost": today_cost, "budget": daily_budget},
            )
            send_cost_alert("warning", msg, today_cost, daily_budget)

        if month_cost >= monthly_budget:
            msg = f"Monthly API cost ${month_cost:.2f} exceeds budget ${monthly_budget:.2f}"
            await record_event(
                organization_id, "cost_alert", "critical", msg,
                {"monthly_cost": month_cost, "budget": monthly_budget},
            )
            send_cost_alert("critical", msg, month_cost, monthly_budget)
    except Exception:
        logger.warning("Failed to check cost alerts", exc_info=True)
