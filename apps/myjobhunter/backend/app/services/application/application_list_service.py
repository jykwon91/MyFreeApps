"""Read side of the Applications list — the paged, sorted table and the kanban board.

Split out of ``application_service`` so neither module outgrows the file-size
guard. Same rules: tenant scoping on every call, repositories own the queries,
``latest_status`` is computed from ``application_events`` and never stored.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.application_list_constants import (
    DEFAULT_PAGE_SIZE,
    DEFAULT_SORT_FIELD,
    DEFAULT_SORT_ORDER,
)
from app.core.application_sort_field import ApplicationSortField
from app.core.sort_order import SortOrder
from app.repositories.application import application_repository
from app.schemas.application.application_kanban_item import ApplicationKanbanItem
from app.schemas.application.application_list_item import ApplicationListItem
from app.schemas.application.application_list_page import ApplicationListPage


async def list_applications(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    company_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    archived: bool | None = None,
    since: _dt.datetime | None = None,
    sort: ApplicationSortField = DEFAULT_SORT_FIELD,
    order: SortOrder = DEFAULT_SORT_ORDER,
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
) -> ApplicationListPage:
    """One page of a user's non-deleted applications, and how many match in all.

    ``latest_status`` is always computed from ``application_events`` — never
    stored on the applications row. ``total`` is a COUNT with the same
    filters and tenant scope as the page, so a client knows whether there is
    another page to load.

    Optional filters:
    - ``company_id``: narrow to a single company (tenant-safe).
    - ``status_filter``: keep only rows whose latest event_type matches.
    - ``archived``: ``True`` = archived only; ``False`` = active only; ``None`` = all.
    - ``since``: include only applications with ``applied_at >= since``.

    ``sort`` / ``order`` pick the column and direction (missing values last
    either way); ``limit`` / ``offset`` pick the page.

    Known limitation of offset paging: each page is read fresh, so if the list
    changes between one page and the next, the pages drift. An application
    added, or moved earlier by an edit, ahead of the loaded rows pushes one
    already shown into the next page (clients drop the duplicate by id). One
    deleted, archived or moved later from ahead of the loaded rows pulls an
    unseen row back into the pages already read, and that row is silently
    skipped. Nothing is lost for good: a refetch reloads every page from
    offset 0 and shows it. Keyset paging would avoid the skip, at the cost of
    a cursor over every sortable column.
    """
    rows = await application_repository.list_with_status(
        db,
        user_id,
        company_id=company_id,
        status_filter=status_filter,
        archived=archived,
        since=since,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )
    total = await application_repository.count_with_status(
        db,
        user_id,
        company_id=company_id,
        status_filter=status_filter,
        archived=archived,
        since=since,
    )
    items = [
        ApplicationListItem.model_validate(app).model_copy(
            update={"latest_status": status, "company_name": company_name},
        )
        for app, status, company_name in rows
    ]
    return ApplicationListPage(items=items, total=total, has_more=offset + len(items) < total)


async def list_kanban_items(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[ApplicationKanbanItem]:
    """Return non-archived applications shaped for the kanban dashboard.

    Each row carries the company display fields, the most-recent
    stage-defining event, and the verdict from the analysis that
    spawned the application (if any). The frontend derives the column
    id from ``latest_event_type`` via the same mapping the transition
    service uses so the read and write sides stay in sync.
    """
    rows = await application_repository.list_for_kanban(db, user_id)
    return [ApplicationKanbanItem.model_validate(row) for row in rows]
