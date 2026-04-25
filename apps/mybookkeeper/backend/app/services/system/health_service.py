"""Health monitoring service -- aggregates system state from events, documents, and usage logs."""
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import document_repo, system_event_repo, usage_log_repo
from app.models.system.system_event import SystemEvent
from app.schemas.system.health import (
    ActiveProblem,
    HealthStats,
    HealthStatus,
    HealthSummary,
    SystemEventRead,
)

_PROBLEM_MESSAGES: dict[str, str] = {
    "extraction_failed": "{count} documents failed extraction",
    "rate_limited": "API rate limited {count} times in last hour",
    "worker_error": "{count} worker errors in last hour",
    "db_connection_error": "{count} database connection errors",
    "api_usage_high": "High API usage detected ({count} events)",
}


def _derive_status(problems: list[ActiveProblem]) -> HealthStatus:
    severities = {p.severity for p in problems}
    if "critical" in severities:
        return "unhealthy"
    if "error" in severities:
        return "degraded"
    if "warning" in severities:
        return "degraded"
    return "healthy"


async def get_health_summary(organization_id: uuid.UUID) -> HealthSummary:
    now = datetime.now(timezone.utc)
    last_hour = now - timedelta(hours=1)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    async with AsyncSessionLocal() as db:
        event_summary = await system_event_repo.get_health_summary(db, organization_id, last_hour)
        recent_events = await system_event_repo.list_recent(db, organization_id, limit=10)

        processing_count = await document_repo.count_by_status(db, organization_id, "processing")
        extracting_count = await document_repo.count_by_status(db, organization_id, "extracting")
        failed_count = await document_repo.count_by_status(db, organization_id, "failed")
        retry_pending_count = await document_repo.count_retry_pending(db, organization_id)
        extractions_today = await usage_log_repo.count_since(db, organization_id, today_start)
        corrections_today = await system_event_repo.count_by_type(
            db, organization_id, "category_corrected", today_start,
        )
        api_tokens_today = await usage_log_repo.sum_tokens_since(db, organization_id, today_start)

    problems: list[ActiveProblem] = []
    for entry in event_summary:
        event_type = entry["event_type"]
        severity = entry["severity"]
        count = entry["count"]
        msg_template = _PROBLEM_MESSAGES.get(event_type, "{count} {type} events")
        problems.append(ActiveProblem(
            type=event_type,
            count=count,
            severity=severity,
            message=msg_template.format(count=count, type=event_type),
        ))

    return HealthSummary(
        status=_derive_status(problems),
        active_problems=problems,
        stats=HealthStats(
            documents_processing=processing_count + extracting_count,
            documents_failed=failed_count,
            documents_retry_pending=retry_pending_count,
            extractions_today=extractions_today,
            corrections_today=corrections_today,
            api_tokens_today=api_tokens_today,
        ),
        recent_events=[SystemEventRead.model_validate(e) for e in recent_events],
    )


async def get_events(
    organization_id: uuid.UUID,
    *,
    event_type: str | None = None,
    severity: str | None = None,
    resolved: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> Sequence[SystemEvent]:
    async with AsyncSessionLocal() as db:
        return await system_event_repo.list_filtered(
            db, organization_id,
            event_type=event_type,
            severity=severity,
            resolved=resolved,
            limit=limit,
            offset=offset,
        )


async def resolve_event(event_id: uuid.UUID, organization_id: uuid.UUID) -> bool:
    async with unit_of_work() as db:
        return await system_event_repo.resolve(db, event_id, organization_id)


async def retry_failed_documents(organization_id: uuid.UUID) -> int:
    """Reset failed documents with retry_count < MAX_RETRIES back to processing."""
    async with unit_of_work() as db:
        return await document_repo.reset_failed_retryable(db, organization_id, max_retries=3)
