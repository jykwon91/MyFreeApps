"""ExtractionLog repository — Phase 1 stub."""
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.extraction_log import ExtractionLog


async def get_by_id(db: AsyncSession, log_id: uuid.UUID, user_id: uuid.UUID) -> ExtractionLog | None:
    result = await db.execute(
        select(ExtractionLog).where(ExtractionLog.id == log_id, ExtractionLog.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[ExtractionLog]:
    result = await db.execute(
        select(ExtractionLog).where(ExtractionLog.user_id == user_id)
    )
    return list(result.scalars().all())


async def sum_cost_since(
    db: AsyncSession, user_id: uuid.UUID, *, since: datetime,
) -> float:
    """Total ``cost_usd`` of the user's extraction logs created at or after ``since``."""
    result = await db.execute(
        select(func.coalesce(func.sum(ExtractionLog.cost_usd), 0)).where(
            ExtractionLog.user_id == user_id,
            ExtractionLog.created_at >= since,
        )
    )
    return float(result.scalar_one() or 0)


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    context_type: str,
    context_id: uuid.UUID | None,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    cost_usd: float | None,
    duration_ms: int,
    status: str,
    error_message: str | None,
    created_at,
) -> ExtractionLog:
    """Insert one extraction_logs row and commit.

    Cost-tracking writes are load-bearing for per-user budget
    enforcement — callers must not swallow failures.
    """
    log = ExtractionLog(
        user_id=user_id,
        context_type=context_type,
        context_id=context_id,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        duration_ms=duration_ms,
        status=status,
        error_message=error_message,
        created_at=created_at,
    )
    db.add(log)
    await db.commit()
    return log
