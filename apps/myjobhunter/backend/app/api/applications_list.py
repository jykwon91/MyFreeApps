"""``GET /applications`` — the caller's applications, one sorted page at a time.

Split out of ``app.api.applications`` (which keeps every other Applications
route) so neither file outgrows the file-size guard. Thin: validation is the
query-param types, the work is ``application_list_service``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.application_list_constants import (
    DEFAULT_PAGE_SIZE,
    DEFAULT_SORT_FIELD,
    DEFAULT_SORT_ORDER,
    MAX_PAGE_SIZE,
)
from app.core.application_sort_field import ApplicationSortField
from app.core.auth import current_active_user
from app.core.sort_order import SortOrder
from app.db.session import get_db
from app.models.user.user import User
from app.services.application import application_list_service

router = APIRouter()


@router.get("/applications")
async def list_applications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    company_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None, description="Filter by latest event_type"),
    archived: bool | None = Query(default=None, description="True=archived only; False=active only"),
    since: _dt.datetime | None = Query(default=None, description="applied_at >= since (ISO-8601)"),
    sort: ApplicationSortField = Query(default=DEFAULT_SORT_FIELD, description="Column to sort on"),
    order: SortOrder = Query(default=DEFAULT_SORT_ORDER, description="asc or desc; missing values sort last either way"),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    view: str | None = Query(
        default=None,
        description="When 'kanban', return board-shaped rows with company + verdict joined.",
    ),
) -> dict:
    """Return the caller's non-deleted applications.

    Default response shape: ``{"items": [ApplicationListItem...], "total": int}``.
    Each item includes ``latest_status: str | None`` — the ``event_type`` of
    the most-recent ``application_events`` row.

    When ``view=kanban`` is supplied the response shape changes to
    ``{"items": [ApplicationKanbanItem...], "total": int}`` — board-shaped
    rows with the company name + logo and the verdict from the analysis
    that spawned the application (when present) joined in. Other filters
    are ignored in kanban view; the board always renders all non-archived,
    non-deleted applications for the user.

    Filters (default view only):
    - ``company_id``: narrow to a single company (tenant-safe empty list on miss).
    - ``status``: keep only rows whose latest event_type matches (e.g. "applied").
    - ``archived``: ``true`` = archived only; ``false`` = active only; omit = all.
    - ``since``: include only applications with ``applied_at >= since``.
    - ``sort`` / ``order``: one of applied, company, role, status (pipeline
      order), location, remote, fit; ``asc`` or ``desc``. Rows missing the
      value sort last in both directions; ties keep the default order
      (applied most recently first). Anything else is a 422.
    - ``limit`` / ``offset``: pagination (default 100 / 0; max limit 500).

    ``total`` is the number of rows matching the filters across every page,
    not the length of this page.
    """
    if view == "kanban":
        kanban_items = await application_list_service.list_kanban_items(db, user.id)
        return {
            "items": [item.model_dump(mode="json") for item in kanban_items],
            "total": len(kanban_items),
        }

    page = await application_list_service.list_applications(
        db,
        user.id,
        company_id=company_id,
        status_filter=status,
        archived=archived,
        since=since,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )
    return page.model_dump(mode="json")
