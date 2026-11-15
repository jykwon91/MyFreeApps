"""Persist an Application created by applying to a role (promote paths).

Shared by discovery promote and apply-from-analysis so both date the
application identically: ``applied_at`` and the initial ``applied`` event use
the same moment the user applied.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.repositories.application import application_event_repository, application_repository


async def create_applied_application(
    db: AsyncSession,
    application: Application,
    *,
    event_source: str,
) -> Application:
    """Create ``application`` dated now, plus its initial ``applied`` event (flushed)."""
    now = datetime.now(timezone.utc)
    application.applied_at = now
    application = await application_repository.create(db, application)
    await application_event_repository.create(
        db,
        ApplicationEvent(
            user_id=application.user_id,
            application_id=application.id,
            event_type="applied",
            occurred_at=now,
            source=event_source,
        ),
    )
    return application
