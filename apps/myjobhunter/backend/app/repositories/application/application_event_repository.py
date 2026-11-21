"""Repository for ``application_events`` — the event log per application.

Per the data model: events are append-only EXCEPT for the two
user-input columns ``interview_details`` and ``note`` on interview-typed
events (PR for interview-details edit, 2026-05-21). Status is still
computed by lateral join ordered by ``LATEST_EVENT_ORDER`` —
NEVER stored as a column on applications.

Tenant scoping is mandatory — every public function takes ``user_id`` and
filters by it. Events also carry their own ``user_id`` (denormalized from
the parent application) so tenant filters short-circuit without a join
back to applications.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application_event import ApplicationEvent
from app.repositories.application.latest_event_order import LATEST_EVENT_ORDER


async def list_by_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> list[ApplicationEvent]:
    """Return events for an application, newest first (``LATEST_EVENT_ORDER``).

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
        .order_by(*LATEST_EVENT_ORDER),
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


async def get_by_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    event_id: uuid.UUID,
) -> ApplicationEvent | None:
    """Return the event matching all three of (event_id, application_id,
    user_id) — composite WHERE guards IDOR.

    A caller who knows an event UUID but does not own the parent
    application is returned None (route maps to 404). The triple match
    means knowing only the event_id is not enough to reach a row.
    """
    result = await db.execute(
        select(ApplicationEvent).where(
            ApplicationEvent.id == event_id,
            ApplicationEvent.application_id == application_id,
            ApplicationEvent.user_id == user_id,
        ),
    )
    return result.scalar_one_or_none()


_USER_EDITABLE_COLUMNS = frozenset({"interview_details", "note"})


async def update_user_fields(
    db: AsyncSession, event: ApplicationEvent, updates: dict[str, Any],
) -> ApplicationEvent:
    """Apply updates to the user-input columns (``interview_details``, ``note``) only."""
    for key, value in updates.items():
        if key in _USER_EDITABLE_COLUMNS:
            setattr(event, key, value)
    await db.flush()
    await db.refresh(event)
    return event


async def latest_event_type_among(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    event_types: Iterable[str],
) -> str | None:
    """The ``event_type`` of the newest event (by ``LATEST_EVENT_ORDER``) whose type is in ``event_types``."""
    stmt = (
        select(ApplicationEvent.event_type)
        .where(
            ApplicationEvent.application_id == application_id,
            ApplicationEvent.user_id == user_id,
            ApplicationEvent.event_type.in_(tuple(event_types)),
        )
        .order_by(*LATEST_EVENT_ORDER)
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_recent_by_idempotency_key(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    idempotency_key: str,
    created_since: _dt.datetime,
) -> ApplicationEvent | None:
    """The newest event created since ``created_since`` whose ``raw_payload`` carries this key."""
    stmt = (
        select(ApplicationEvent)
        .where(
            ApplicationEvent.application_id == application_id,
            ApplicationEvent.user_id == user_id,
            ApplicationEvent.created_at >= created_since,
            ApplicationEvent.raw_payload["idempotency_key"].astext == idempotency_key,
        )
        .order_by(ApplicationEvent.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
