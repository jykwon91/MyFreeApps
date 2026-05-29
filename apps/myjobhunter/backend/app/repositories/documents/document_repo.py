"""Repository for ``documents`` — all queries against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory.

Soft-delete: ``deleted_at IS NULL`` is applied by default. Pass
``include_deleted=True`` to include soft-deleted rows (used by the
soft-delete service function to make DELETE idempotent).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories import soft_delete as _soft_delete

from app.core.enums import DocumentKind
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


async def get_by_id_for_user(
    db: AsyncSession,
    document_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> Document | None:
    """Return the document iff it belongs to ``user_id``."""
    stmt = select(Document).where(
        Document.id == document_id,
        Document.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Document.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    application_id: uuid.UUID | None = None,
    kind: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Document]:
    """List non-deleted documents owned by ``user_id``.

    Optional filters:
    - ``application_id``: narrow to documents linked to a specific application.
      Pass ``uuid.UUID('00000000-0000-0000-0000-000000000000')`` to mean "only
      unlinked" — callers should use the explicit ``None`` check instead.
    - ``kind``: narrow to a specific document kind.
    - ``limit`` / ``offset``: standard pagination.
    """
    stmt = (
        select(Document)
        .where(
            Document.user_id == user_id,
            Document.deleted_at.is_(None),
        )
        .order_by(Document.updated_at.desc(), Document.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if application_id is not None:
        stmt = stmt.where(Document.application_id == application_id)
    if kind is not None:
        stmt = stmt.where(Document.kind == kind)

    result = await db.execute(stmt)
    return list(result.scalars().all())


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
    """Persist a new Document row."""
    db.add(document)
    await db.flush()
    await db.refresh(document)
    return document


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
    await db.refresh(document)
    return document


async def soft_delete(db: AsyncSession, document: Document) -> Document:
    """Mark a Document as soft-deleted.

    Idempotent — if ``deleted_at`` is already set, the existing timestamp
    is preserved.
    """
    was_deleted = await _soft_delete(db, document)
    if was_deleted:
        await db.refresh(document)
    return document
