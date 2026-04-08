"""Fire-and-forget event recording. Never raises — logs on failure.

This is a factory that creates an event recorder bound to a specific
unit_of_work and repository function.

Usage:
    record_event = create_event_recorder(unit_of_work, system_event_repo.record)
    await record_event(org_id, "extraction.complete", "info", "Extracted 3 invoices")
"""
import logging
import uuid
from typing import Any, Callable

logger = logging.getLogger(__name__)


def create_event_recorder(
    unit_of_work: Any,
    repo_record_fn: Callable,
) -> Callable:
    """Create a fire-and-forget event recorder.

    Args:
        unit_of_work: An async context manager that yields a DB session.
        repo_record_fn: An async function(db, org_id, event_type, severity, message, data).
    """
    async def record_event(
        organization_id: uuid.UUID | None,
        event_type: str,
        severity: str,
        message: str,
        data: dict | None = None,
    ) -> None:
        try:
            async with unit_of_work() as db:
                await repo_record_fn(db, organization_id, event_type, severity, message, data)
        except Exception:
            logger.warning("Failed to record system event: %s/%s", event_type, severity, exc_info=True)

    return record_event
