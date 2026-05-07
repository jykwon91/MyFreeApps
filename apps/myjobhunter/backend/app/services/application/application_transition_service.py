"""Drag-drop transition service for the kanban dashboard.

Translates a coarse-grained kanban column move ("interviewing", "offer",
etc.) into a fine-grained ``application_events`` row. Reuses the existing
event-log machinery — there is no separate "transitions" table, so the
audit trail is the same one the activity feed reads from.

Security:
- Tenant scoping is mandatory. Cross-tenant target -> 404 (no existence leak).
- ``occurred_at`` is server-clock only. The client never gets to pin a
  past or future timestamp via this endpoint.
- Idempotency: a duplicate drag (drag, network blip, drag again) within
  ``_IDEMPOTENCY_WINDOW_SECONDS`` is detected via the ``idempotency_key``
  recorded in ``raw_payload`` and the existing event is returned instead
  of double-logging.

Design notes:
- The transition writes a single ``ApplicationEvent`` row. The kanban
  query lateral-joins ``application_events ORDER BY occurred_at DESC``
  so the new row immediately becomes the column for that card on the
  next read.
- "Closed" defaults to ``rejected`` because that's the most common
  ground truth. The operator can refine via the drawer's ``Log Event``
  affordance (withdrawn / ghosted) afterward.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ALLOWED_TRANSITIONS, EventSource, EventType, KanbanColumn
from app.models.application.application_event import ApplicationEvent
from app.repositories.application import application_event_repository, application_repository


KanbanTargetColumn = Literal["applied", "interviewing", "offer", "closed"]


# Window inside which an identical idempotency_key collapses two writes
# into one. 30 seconds covers the realistic drag-retry-on-flaky-network
# case without hiding two genuinely-distinct moves.
_IDEMPOTENCY_WINDOW_SECONDS = 30


# Fixed column->event mapping for new transitions. The "closed" bucket
# defaults to "rejected" because that's the most common ground truth;
# the operator can refine via Log Event afterward.
_TARGET_COLUMN_TO_EVENT_TYPE: dict[str, str] = {
    KanbanColumn.APPLIED: EventType.APPLIED,
    KanbanColumn.INTERVIEWING: EventType.INTERVIEW_SCHEDULED,
    KanbanColumn.OFFER: EventType.OFFER_RECEIVED,
    KanbanColumn.CLOSED: EventType.REJECTED,
}


# Mapping back from event_type -> kanban column, for figuring out the
# "current column" of an application before a drag.
_EVENT_TYPE_TO_COLUMN: dict[str, str] = {
    EventType.APPLIED: KanbanColumn.APPLIED,
    EventType.INTERVIEW_SCHEDULED: KanbanColumn.INTERVIEWING,
    EventType.INTERVIEW_COMPLETED: KanbanColumn.INTERVIEWING,
    EventType.OFFER_RECEIVED: KanbanColumn.OFFER,
    EventType.REJECTED: KanbanColumn.CLOSED,
    EventType.WITHDRAWN: KanbanColumn.CLOSED,
    EventType.GHOSTED: KanbanColumn.CLOSED,
}


class TransitionNotAllowedError(ValueError):
    """The target column is not reachable from the current column.

    Routed to HTTP 400 by the route handler.
    """


def _column_for_event_type(event_type: str | None) -> str:
    """Resolve the kanban column an application sits in given its latest
    stage-defining event_type. ``None`` -> applied (legacy data)."""
    if event_type is None:
        return KanbanColumn.APPLIED
    return _EVENT_TYPE_TO_COLUMN.get(event_type, KanbanColumn.APPLIED)


async def _resolve_current_column(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> str:
    """Return the kanban column the application currently sits in.

    Reads the most-recent stage-defining event_type for the application,
    or returns ``applied`` if none exist.
    """
    stmt = (
        select(ApplicationEvent.event_type)
        .where(
            ApplicationEvent.application_id == application_id,
            ApplicationEvent.user_id == user_id,
            ApplicationEvent.event_type.in_(tuple(_EVENT_TYPE_TO_COLUMN.keys())),
        )
        .order_by(ApplicationEvent.occurred_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    latest = result.scalar_one_or_none()
    return _column_for_event_type(latest)


async def _find_recent_idempotent_event(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    idempotency_key: str,
    window_seconds: int = _IDEMPOTENCY_WINDOW_SECONDS,
) -> ApplicationEvent | None:
    """Look for a recent event with this idempotency_key.

    Compares only inside the configured window so a stale key from a
    prior session can't suppress a legitimate drag months later.
    """
    cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(seconds=window_seconds)
    stmt = (
        select(ApplicationEvent)
        .where(
            ApplicationEvent.application_id == application_id,
            ApplicationEvent.user_id == user_id,
            ApplicationEvent.created_at >= cutoff,
            ApplicationEvent.raw_payload["idempotency_key"].astext == idempotency_key,
        )
        .order_by(ApplicationEvent.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def transition_application(
    db: AsyncSession,
    *,
    application_id: uuid.UUID,
    target_column: KanbanTargetColumn,
    user_id: uuid.UUID,
    idempotency_key: str | None = None,
) -> ApplicationEvent | None:
    """Persist an event representing a kanban-column drag.

    Returns ``None`` when the application does not exist under
    ``user_id`` (route maps to HTTP 404 — no enumeration leak).

    Raises :class:`TransitionNotAllowedError` when the proposed
    move is not in the ``ALLOWED_TRANSITIONS`` state machine for the
    application's current column. The route handler maps this to
    HTTP 400.

    If ``idempotency_key`` is supplied and an event with the same key
    was written within the last :data:`_IDEMPOTENCY_WINDOW_SECONDS`,
    the existing event is returned and no new row is written.
    """
    if target_column not in KanbanColumn.ALL:
        raise TransitionNotAllowedError(
            f"target_column must be one of {KanbanColumn.ALL}, got {target_column!r}",
        )

    application = await application_repository.get_by_id(db, application_id, user_id)
    if application is None:
        return None

    # Idempotency check before any state mutation. We pin the search to
    # this application + this user so a recycled UUID across sessions
    # can never hide a different application's prior write.
    if idempotency_key is not None:
        existing = await _find_recent_idempotent_event(
            db,
            user_id=user_id,
            application_id=application_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            return existing

    current_column = await _resolve_current_column(
        db, user_id=user_id, application_id=application_id,
    )

    allowed_targets = ALLOWED_TRANSITIONS.get(current_column, frozenset())
    if target_column not in allowed_targets:
        raise TransitionNotAllowedError(
            f"Cannot transition from {current_column!r} to {target_column!r}",
        )

    event_type = _TARGET_COLUMN_TO_EVENT_TYPE[target_column]
    raw_payload: dict[str, str] | None = (
        {"idempotency_key": idempotency_key} if idempotency_key is not None else None
    )

    event = ApplicationEvent(
        user_id=user_id,
        application_id=application_id,
        event_type=event_type,
        # Server-side now() — never trust the client clock for occurred_at
        # on a transition.
        occurred_at=_dt.datetime.now(_dt.timezone.utc),
        source=EventSource.MANUAL,
        raw_payload=raw_payload,
    )
    event = await application_event_repository.create(db, event)
    await db.commit()
    return event
