"""Fire-and-forget event recording. Never raises -- logs on failure."""
import logging
import uuid

from app.db.session import unit_of_work
from app.repositories import system_event_repo

logger = logging.getLogger(__name__)


async def record_event(
    organization_id: uuid.UUID | None,
    event_type: str,
    severity: str,
    message: str,
    data: dict | None = None,
) -> None:
    try:
        async with unit_of_work() as db:
            await system_event_repo.record(db, organization_id, event_type, severity, message, data)
    except Exception:
        logger.warning("Failed to record system event: %s/%s", event_type, severity, exc_info=True)
