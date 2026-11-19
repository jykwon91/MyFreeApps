"""The documents list: a page of it, how many match, and every match for "select all"."""
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, Row, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.document_constants import DOCUMENT_NEEDS_REVIEW_STATUSES
from app.core.document_list_constants import DOCUMENT_NOT_IN_LIBRARY_STATUSES, DocumentSortField
from app.core.transaction_sort_constants import SortDirection
from app.models.documents.document import Document
from app.schemas.documents.document_filters import DocumentFilters

_TEXT_SORT_COLUMNS = {
    "file_name": Document.file_name,
    "document_type": Document.document_type,
    "status": Document.status,
    "source": Document.source,
}


def _filtered(stmt: Select[Any], organization_id: uuid.UUID, filters: DocumentFilters) -> Select[Any]:
    """Narrows a select over Document the one way a page, its count and "select all" all read."""
    stmt = stmt.where(Document.organization_id == organization_id, Document.deleted_at.is_(None))
    if filters.property_id is not None:
        stmt = stmt.where(Document.property_id == filters.property_id)
    if filters.exclude_processing:
        stmt = stmt.where(Document.status.notin_(DOCUMENT_NOT_IN_LIBRARY_STATUSES))
    if filters.needs_review:
        stmt = stmt.where(Document.status.in_(DOCUMENT_NEEDS_REVIEW_STATUSES))
    if filters.search.strip():
        stmt = stmt.where(Document.file_name.icontains(filters.search.strip(), autoescape=True))
    if filters.statuses:
        stmt = stmt.where(Document.status.in_(filters.statuses))
    if filters.document_types:
        stmt = stmt.where(func.coalesce(Document.document_type, "").in_(filters.document_types))
    if filters.sources:
        stmt = stmt.where(Document.source.in_(filters.sources))
    return stmt


def _order_terms(sort_by: DocumentSortField, sort_dir: SortDirection) -> list[ColumnElement[Any]]:
    """The chosen column, then newest first and the id, so rows with equal values keep one order across pages."""
    if sort_by == "created_at":
        primary: ColumnElement[Any] = Document.created_at
        tail = [Document.id.asc() if sort_dir == "asc" else Document.id.desc()]
    else:
        primary = func.lower(func.coalesce(_TEXT_SORT_COLUMNS[sort_by], ""))
        tail = [Document.created_at.desc(), Document.id.desc()]
    return [primary.asc() if sort_dir == "asc" else primary.desc(), *tail]


async def list_page(
    db: AsyncSession,
    organization_id: uuid.UUID,
    filters: DocumentFilters,
    *,
    sort_by: DocumentSortField,
    sort_dir: SortDirection,
    limit: int,
    offset: int,
) -> Sequence[Document]:
    stmt = _filtered(select(Document), organization_id, filters)
    stmt = stmt.order_by(*_order_terms(sort_by, sort_dir)).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def count_filtered(db: AsyncSession, organization_id: uuid.UUID, filters: DocumentFilters) -> int:
    """How many documents ``list_page`` would return across every page for the same filters."""
    stmt = _filtered(select(func.count()).select_from(Document), organization_id, filters)
    result = await db.execute(stmt)
    return result.scalar_one()


async def list_selection_refs(
    db: AsyncSession, organization_id: uuid.UUID, filters: DocumentFilters,
) -> Sequence[Row[tuple[uuid.UUID, str]]]:
    """(id, status) of every document the filters match, newest first: what "select all" ticks."""
    stmt = _filtered(select(Document.id, Document.status), organization_id, filters)
    result = await db.execute(stmt.order_by(Document.created_at.desc(), Document.id.desc()))
    return result.all()
