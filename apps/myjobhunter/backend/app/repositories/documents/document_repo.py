"""Repository for ``documents`` — all queries against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory.

Soft-delete: ``deleted_at IS NULL`` is applied by default. Pass
``include_deleted=True`` to include soft-deleted rows (used by the
soft-delete service function to make DELETE idempotent).

Links to soft-deleted applications: the stored ``application_id`` is kept (an
application can be restored), but every row returned here carries
``live_application_id``, the link only while the application is live, and the
``application_id`` filter matches live applications only. So no read offers a
link to an application that can't be opened, and a restore brings it back.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import with_expression

from platform_shared.repositories import soft_delete as _soft_delete

from app.core.document_list_constants import DEFAULT_DOCUMENT_PAGE_SIZE
from app.core.enums import DocumentKind
from app.models.application.application import Application
from app.models.application.document import Document

# Allowlist of columns safe to update via the dynamic ``update`` function.
# Excludes server-managed columns (id, user_id, created_at, updated_at, deleted_at)
# and file-storage columns that are set only at creation time.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "title",
    "kind",
    "body",
    "application_id",
})

# The document's application id while that application is live, else NULL.
_LIVE_APPLICATION_ID = (
    select(Application.id)
    .where(Application.id == Document.application_id, Application.deleted_at.is_(None))
    .correlate(Document)
    .scalar_subquery()
)
_LOAD_LIVE_LINK = with_expression(Document.live_application_id, _LIVE_APPLICATION_ID)


async def get_by_id_for_user(
    db: AsyncSession,
    document_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> Document | None:
    """Return the document iff it belongs to ``user_id``, with ``live_application_id`` loaded.

    ``populate_existing`` reloads a row already in the session, so the link is
    current after a write too.
    """
    stmt = (
        select(Document)
        .where(Document.id == document_id, Document.user_id == user_id)
        .options(_LOAD_LIVE_LINK)
        .execution_options(populate_existing=True)
    )
    if not include_deleted:
        stmt = stmt.where(Document.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _list_conditions(
    user_id: uuid.UUID,
    *,
    application_id: uuid.UUID | None,
    kind: str | None,
) -> list[ColumnElement[bool]]:
    """The tenant scope and filters shared by the page query and its count."""
    conditions: list[ColumnElement[bool]] = [
        Document.user_id == user_id,
        Document.deleted_at.is_(None),
    ]
    if application_id is not None:
        # A deleted application's documents aren't listed as linked to it.
        conditions.append(Document.application_id == application_id)
        conditions.append(_LIVE_APPLICATION_ID.is_not(None))
    if kind is not None:
        conditions.append(Document.kind == kind)
    return conditions


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    application_id: uuid.UUID | None = None,
    kind: str | None = None,
    limit: int = DEFAULT_DOCUMENT_PAGE_SIZE,
    offset: int = 0,
) -> list[Document]:
    """One page of non-deleted documents owned by ``user_id``, most recently updated first.

    Rows that tie on ``updated_at`` and ``created_at`` fall back to ``id``, so
    ``OFFSET`` / ``LIMIT`` pages never repeat or skip a row. Every filter is
    applied in SQL before paging; ``count_for_user`` with the same filters
    gives the total across pages.

    Optional filters:
    - ``application_id``: narrow to documents linked to a specific application.
    - ``kind``: narrow to a specific document kind.
    """
    stmt = (
        select(Document)
        .where(*_list_conditions(user_id, application_id=application_id, kind=kind))
        .options(_LOAD_LIVE_LINK)
        .order_by(Document.updated_at.desc(), Document.created_at.desc(), Document.id.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    application_id: uuid.UUID | None = None,
    kind: str | None = None,
) -> int:
    """How many rows ``list_for_user`` matches across all pages, same filters and tenant scope."""
    stmt = (
        select(func.count())
        .select_from(Document)
        .where(*_list_conditions(user_id, application_id=application_id, kind=kind))
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def list_by_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> list[Document]:
    """Return all non-deleted documents linked to ``application_id``."""
    result = await db.execute(
        select(Document)
        .where(
            Document.user_id == user_id,
            Document.application_id == application_id,
            Document.deleted_at.is_(None),
        )
        .order_by(Document.updated_at.desc(), Document.created_at.desc())
        .options(_LOAD_LIVE_LINK)
    )
    return list(result.scalars().all())


async def latest_job_description_body(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> str | None:
    """Body of the most-recently-updated, non-deleted ``job_description``
    document linked to ``application_id`` (text-body documents only).

    Backs the application-detail view's inline-JD fallback: when the
    application's own ``jd_text`` column is empty because the JD was attached
    as a document rather than typed in, the read view surfaces this body so
    the JD is visible without opening + editing the document. File-only
    uploads (``body IS NULL``/empty) are skipped — there is nothing to render
    inline. Returns ``None`` when no qualifying document exists.
    """
    result = await db.execute(
        select(Document.body)
        .where(
            Document.user_id == user_id,
            Document.application_id == application_id,
            Document.kind == DocumentKind.JOB_DESCRIPTION,
            Document.deleted_at.is_(None),
            Document.body.isnot(None),
            Document.body != "",
        )
        .order_by(Document.updated_at.desc(), Document.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, document: Document) -> Document:
    """Persist a new Document row and return it with ``live_application_id`` loaded."""
    db.add(document)
    await db.flush()
    return await _reload(db, document)


async def update(
    db: AsyncSession,
    document: Document,
    updates: dict[str, Any],
) -> Document:
    """Apply allowlisted updates to a Document row.

    Keys outside ``_UPDATABLE_COLUMNS`` are silently dropped (defense-in-depth
    on top of the Pydantic schema's ``extra='forbid'``).
    """
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return document

    for key, value in safe_fields.items():
        setattr(document, key, value)
    await db.flush()
    return await _reload(db, document)


async def _reload(db: AsyncSession, document: Document) -> Document:
    """``document`` as stored, server defaults and ``live_application_id`` included."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document.id, Document.user_id == document.user_id)
        .options(_LOAD_LIVE_LINK)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def soft_delete(db: AsyncSession, document: Document) -> Document:
    """Mark a Document as soft-deleted.

    Idempotent — if ``deleted_at`` is already set, the existing timestamp
    is preserved.
    """
    was_deleted = await _soft_delete(db, document)
    if was_deleted:
        await db.refresh(document)
    return document


async def list_storage_keys_for_applications(
    db: AsyncSession, application_ids: list[uuid.UUID], user_id: uuid.UUID,
) -> list[str]:
    """Stored-file keys of every document on the applications, soft-deleted ones included."""
    result = await db.execute(
        select(Document.file_path).where(
            Document.application_id.in_(application_ids),
            Document.user_id == user_id,
            Document.file_path.is_not(None),
        )
    )
    return sorted(set(result.scalars().all()))
