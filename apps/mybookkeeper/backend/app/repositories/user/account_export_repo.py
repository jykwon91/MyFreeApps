"""Reads every row that belongs in one user's account data export.

Which tables are read, and how each one is scoped, is declared in
``account_export_sources``. Child tables are selected with a subquery on their
parent's own criteria, so the query size does not grow with the number of
parent rows.

A table whose read endpoint in the app is limited to some roles is read
only for a member holding one of them, and so are its child tables.

Soft-deleted rows are read too: they are still stored, so they belong in the
user's copy of their data, and their ``deleted_at`` value shows they were deleted.
"""
import uuid
from collections.abc import Sequence

from sqlalchemy import ColumnElement, Table, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_export_scope import AccountExportScope
from app.db.base import Base
from app.models.organization.organization_member import OrgRole
from app.repositories.user.account_export_source import AccountExportSource
from app.repositories.user.account_export_sources import ACCOUNT_EXPORT_SOURCES

_CREATED_AT_COLUMN = "created_at"


def _own_criteria(
    source: AccountExportSource,
    table: Table,
    criteria_by_table: dict[str, list[ColumnElement[bool]]],
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[ColumnElement[bool]]:
    if source.scope is AccountExportScope.WORKSPACE_ITSELF:
        return [table.c.id == organization_id]
    if source.scope is AccountExportScope.WORKSPACE:
        return [table.c.organization_id == organization_id]
    if source.scope is AccountExportScope.WORKSPACE_MEMBER:
        return [table.c.organization_id == organization_id, table.c.user_id == user_id]
    if source.scope is AccountExportScope.USER:
        return [table.c.user_id == user_id]
    assert source.parent is not None and source.parent_fk is not None
    parent_table: Table = source.parent.__table__
    parent_ids = select(parent_table.c.id).where(*criteria_by_table[parent_table.name])
    return [table.c[source.parent_fk].in_(parent_ids)]


def _ordering(table: Table) -> list[ColumnElement[object]]:
    leading = [table.c[_CREATED_AT_COLUMN]] if _CREATED_AT_COLUMN in table.c else []
    return [*leading, *table.primary_key.columns]


async def list_account_export_rows(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    org_role: OrgRole,
) -> dict[str, Sequence[Base]]:
    """Return the rows of every table ``org_role`` may read, keyed by table name."""
    criteria_by_table: dict[str, list[ColumnElement[bool]]] = {}
    rows_by_table: dict[str, Sequence[Base]] = {}
    for source in ACCOUNT_EXPORT_SOURCES:
        if not source.is_readable_by(org_role):
            continue
        if source.parent is not None and source.parent.__table__.name not in criteria_by_table:
            continue
        table: Table = source.model.__table__
        criteria = _own_criteria(source, table, criteria_by_table, organization_id, user_id)
        criteria_by_table[table.name] = criteria
        result = await db.execute(
            select(source.model).where(*criteria).order_by(*_ordering(table)),
        )
        rows_by_table[table.name] = result.scalars().all()
    return rows_by_table
