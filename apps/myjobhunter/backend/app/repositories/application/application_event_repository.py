"""Repository for ``application_events`` — the immutable event log per
application.

Per the data model: events are an INSERT-only table with no soft delete.
Status is computed by lateral join on (application_id, occurred_at DESC) —
NEVER stored as a column on applications.

Tenant scoping is mandatory — every public function takes ``user_id`` and
filters by it. Events also carry their own ``user_id`` (denormalized from
the parent application) so tenant filters short-circuit without a join
back to applications.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application_event import ApplicationEvent


async def list_by_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> list[ApplicationEvent]:
    """Return events for an application, newest first.

    Filters by both ``user_id`` and ``application_id`` so a malicious
    caller passing another user's application_id sees an empty list (the
    route layer's existence check on the parent application is the
    canonical no-leak boundary; this is defense in depth).
    """
    result = await db.execute(
        select(ApplicationEvent)
        .where(
            ApplicationEvent.user_id == user_id,
            ApplicationEvent.application_id == application_id,
        )
        .order_by(ApplicationEvent.occurred_at.desc()),
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, event: ApplicationEvent) -> ApplicationEvent:
    """Persist a new ``ApplicationEvent``.

    The caller (service layer) sets ``user_id``, ``application_id``,
    ``event_type``, ``occurred_at``, ``source`` from the validated request
    context. The repo intentionally takes a fully-constructed ORM
    instance — keeps field validation in one place (schema + service).
    """
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event
