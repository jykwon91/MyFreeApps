"""Query building blocks for the applications list and its count.

Used only by ``application_repository``: the latest-event LATERAL, the WHERE
clause the list page and its count share, and the allowlist of sortable
expressions behind ``?sort=``. Kept in one place so the status shown, the
status filter, the status sort and the total all read the same rows.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import ColumnElement, Lateral, UnaryExpression, case, func, null, select

from app.core.application_list_constants import (
    REMOTE_SORT_RANKS,
    STATUS_SORT_RANKS,
    UNKNOWN_STATUS_SORT_RANK,
)
from app.core.application_sort_field import ApplicationSortField
from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company

# Which event is an application's latest. Two events can share an
# ``occurred_at`` (a kanban move and its note, an import), so the later-written
# one wins, then the higher id, and the same event is chosen on every read.
LATEST_EVENT_ORDER: tuple[UnaryExpression[Any], ...] = (
    ApplicationEvent.occurred_at.desc(),
    ApplicationEvent.created_at.desc(),
    ApplicationEvent.id.desc(),
)


def latest_event_lateral(user_id: uuid.UUID) -> Lateral:
    """The application's most recent event, as a LATERAL row.

    Read once per application and shared by the selected ``latest_status``,
    the ``status`` filter and the ``status`` sort, so all three always agree
    on which event is latest. ``ix_appevent_app_occurred(application_id,
    occurred_at) INCLUDE (event_type)`` still finds the newest
    ``occurred_at``; only a tie on it reads ``created_at`` and ``id`` from the
    row. An application has a handful of events, so that costs too little to
    justify widening the index. ``user_id`` is filtered on the events side as
    well so one user's events can never attach to another user's application.
    """
    return (
        select(ApplicationEvent.event_type.label("event_type"))
        .where(
            ApplicationEvent.application_id == Application.id,
            ApplicationEvent.user_id == user_id,
        )
        .order_by(*LATEST_EVENT_ORDER)
        .limit(1)
        .correlate(Application)
        .lateral("latest_event")
    )


def list_conditions(
    user_id: uuid.UUID,
    latest_event: Lateral,
    *,
    company_id: uuid.UUID | None,
    status_filter: str | None,
    archived: bool | None,
    since: _dt.datetime | None,
) -> list[ColumnElement[bool]]:
    """The WHERE clause shared by the list page and its count."""
    conditions: list[ColumnElement[bool]] = [
        Application.user_id == user_id,
        Application.deleted_at.is_(None),
    ]
    if company_id is not None:
        conditions.append(Application.company_id == company_id)
    if archived is not None:
        conditions.append(Application.archived == archived)
    if since is not None:
        conditions.append(Application.applied_at >= since)
    if status_filter is not None:
        conditions.append(latest_event.c.event_type == status_filter)
    return conditions


def _blank_as_null(column: ColumnElement[str | None]) -> ColumnElement[str | None]:
    """Case-folded text, with an empty or whitespace-only value read as missing."""
    return func.lower(func.nullif(func.btrim(column), ""))


def _status_rank(latest_event: Lateral) -> ColumnElement[int | None]:
    """Pipeline rank of the latest event; NULL when the application has none."""
    event_type = latest_event.c.event_type
    return case(
        (event_type.is_(None), null()),
        *((event_type == name, rank) for name, rank in STATUS_SORT_RANKS.items()),
        else_=UNKNOWN_STATUS_SORT_RANK,
    )


def _remote_rank() -> ColumnElement[int | None]:
    """Remote, then hybrid, then on-site; NULL for "unknown" or anything unranked."""
    return case(
        *((Application.remote_type == name, rank) for name, rank in REMOTE_SORT_RANKS.items()),
        else_=null(),
    )


def sort_expressions(latest_event: Lateral) -> dict[ApplicationSortField, ColumnElement[Any]]:
    """The allowlist of sortable columns, keyed by the ``?sort=`` value.

    Each expression is NULL where the row has nothing to sort on, so
    ``NULLS LAST`` keeps those rows last in both directions.
    """
    return {
        "applied": Application.applied_at,
        "company": _blank_as_null(Company.name),
        "role": _blank_as_null(Application.role_title),
        "status": _status_rank(latest_event),
        "location": _blank_as_null(Application.location),
        "remote": _remote_rank(),
        "fit": Application.fit_score,
    }
