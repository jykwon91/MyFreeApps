"""Find the rows an account deletion removes, by walking foreign keys.

Deleting a user removes their rows through ``ON DELETE CASCADE``, inside the
database, so nothing in Python sees which rows went. Their ids are needed
afterwards to erase those rows' history from ``audit_logs``. This module reads
the foreign keys off the user table's ``MetaData`` and collects, before the
deletion, every row that points at the user and every row cascading from one of
those. After the deletion, :func:`keep_removed` drops the ones still present.

Rows that point at the user without cascading (``SET NULL``, ``RESTRICT``,
``organizations.created_by``) are collected too: an app's ``prepare_deletion``
may delete them itself, as MBK does with the workspaces the user created, and
the cascade from those rows is just as much the user's. Any of them that survive
the deletion are discarded by :func:`keep_removed`.

:func:`missing_records` does the same check for rows found the other way round,
from the audit rows a user wrote, and :func:`workspace_tables` names the tables
whose records belong to a shared workspace rather than to one user.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import Column, ForeignKeyConstraint, MetaData, Table, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from platform_shared.core.audit_erasure_constants import (
    IN_CLAUSE_CHUNK_SIZE,
    ORGANIZATION_TENANT_COLUMN,
)

_PkTuple = tuple[object, ...]
_KeyRow = dict[str, object]


def _chunks(items: Sequence[_PkTuple]) -> Iterable[Sequence[_PkTuple]]:
    for start in range(0, len(items), IN_CLAUSE_CHUNK_SIZE):
        yield items[start:start + IN_CLAUSE_CHUNK_SIZE]


def _match(columns: Sequence[Column[object]], values: Sequence[_PkTuple]) -> ColumnElement[bool]:
    if len(columns) == 1:
        return columns[0].in_([value[0] for value in values])
    return tuple_(*columns).in_(values)


def _cascades(constraint: ForeignKeyConstraint) -> bool:
    return (constraint.ondelete or "").upper() == "CASCADE"


def _incoming(metadata: MetaData) -> dict[str, list[ForeignKeyConstraint]]:
    """Foreign-key constraints of every table, grouped by the table they point at."""
    incoming: dict[str, list[ForeignKeyConstraint]] = {}
    for table in metadata.tables.values():
        for constraint in table.foreign_key_constraints:
            incoming.setdefault(constraint.referred_table.name, []).append(constraint)
    return incoming


def _key_columns(table: Table, incoming: list[ForeignKeyConstraint]) -> list[Column[object]]:
    """The primary key plus every column another table's foreign key points at."""
    columns: dict[str, Column[object]] = {column.name: column for column in table.primary_key.columns}
    for constraint in incoming:
        for element in constraint.elements:
            columns.setdefault(element.column.name, element.column)
    return list(columns.values())


async def collect_candidates(
    db: AsyncSession, user_table: Table, user_id: uuid.UUID,
) -> dict[str, frozenset[_PkTuple]]:
    """Primary keys, per table, of every row that points at the user or cascades from one."""
    metadata = user_table.metadata
    incoming = _incoming(metadata)
    key_columns = {
        name: _key_columns(table, incoming.get(name, [])) for name, table in metadata.tables.items()
    }
    found: dict[str, dict[_PkTuple, _KeyRow]] = {}

    async def add_rows(table: Table, where: ColumnElement[bool]) -> list[_KeyRow]:
        columns = key_columns[table.name]
        result = await db.execute(select(*columns).where(where))
        rows = found.setdefault(table.name, {})
        new: list[_KeyRow] = []
        for row in result.mappings():
            key_row: _KeyRow = {column.name: row[column] for column in columns}
            pk = tuple(key_row[column.name] for column in table.primary_key.columns)
            if pk not in rows:
                rows[pk] = key_row
                new.append(key_row)
        return new

    pending: list[tuple[Table, list[_KeyRow]]] = []
    user_pk = list(user_table.primary_key.columns)
    pending.append((user_table, await add_rows(user_table, user_pk[0] == user_id)))
    while pending:
        parent, parent_rows = pending.pop()
        for constraint in incoming.get(parent.name, []):
            child = constraint.parent
            if child.name == user_table.name:
                continue
            if parent.name != user_table.name and not _cascades(constraint):
                continue
            referred = [element.column.name for element in constraint.elements]
            values = [
                tuple(row[name] for name in referred)
                for row in parent_rows
                if all(row[name] is not None for name in referred)
            ]
            fk_columns = [element.parent for element in constraint.elements]
            for chunk in _chunks(values):
                new_rows = await add_rows(child, _match(fk_columns, chunk))
                if new_rows:
                    pending.append((child, new_rows))
    return {name: frozenset(rows) for name, rows in found.items() if rows}


async def keep_removed(
    db: AsyncSession, metadata: MetaData, candidates: dict[str, frozenset[_PkTuple]],
) -> dict[str, frozenset[_PkTuple]]:
    """Of ``candidates``, the rows no longer in the database."""
    removed: dict[str, frozenset[_PkTuple]] = {}
    for name, pks in candidates.items():
        table = metadata.tables[name]
        pk_columns = list(table.primary_key.columns)
        still_present: set[_PkTuple] = set()
        for chunk in _chunks(sorted(pks, key=str)):
            result = await db.execute(select(*pk_columns).where(_match(pk_columns, chunk)))
            still_present.update(tuple(row) for row in result.all())
        gone = pks - still_present
        if gone:
            removed[name] = frozenset(gone)
    return removed


def workspace_tables(metadata: MetaData) -> frozenset[str]:
    """Tables holding a shared workspace's records, found by foreign-key ancestry.

    Starts from every table with an ``organization_id`` column and the tables
    that column points at, then adds every table with a foreign key to one
    already found (leases under listings, attachments under leases, and so on),
    until nothing new turns up. Empty for an app without workspaces.
    """
    shared: set[str] = set()
    for table in metadata.tables.values():
        column = table.columns.get(ORGANIZATION_TENANT_COLUMN)
        if column is not None:
            shared.add(table.name)
            shared.update(fk.column.table.name for fk in column.foreign_keys)
    grew = True
    while grew:
        grew = False
        for table in metadata.tables.values():
            if table.name in shared:
                continue
            if any(constraint.referred_table.name in shared for constraint in table.foreign_key_constraints):
                shared.add(table.name)
                grew = True
    return frozenset(shared)


def _parse_record_id(table: Table, record_id: str) -> _PkTuple | None:
    """The primary-key values ``format_record_id`` turned into ``record_id``, or None if it can't tell."""
    columns = list(table.primary_key.columns)
    parts = record_id.split(",")
    if len(parts) != len(columns):
        return None
    values: list[object] = []
    for column, part in zip(columns, parts):
        try:
            python_type = column.type.python_type
            values.append(python_type(part))
        except (NotImplementedError, TypeError, ValueError):
            return None
    return tuple(values)


async def missing_records(
    db: AsyncSession, metadata: MetaData, records_by_table: dict[str, list[str]],
) -> dict[str, list[str]]:
    """Of these audit record ids, per table, the ones whose row no longer exists.

    A table the app's models don't know, or a record id that can't be read back
    into a primary key, is left out: it can't be checked, so it isn't erased.
    """
    missing: dict[str, list[str]] = {}
    for name, record_ids in records_by_table.items():
        table = metadata.tables.get(name)
        if table is None:
            continue
        parsed = {record_id: _parse_record_id(table, record_id) for record_id in record_ids}
        keys = {record_id: pk for record_id, pk in parsed.items() if pk is not None}
        removed = await keep_removed(db, metadata, {name: frozenset(keys.values())})
        gone = removed.get(name, frozenset())
        ids = sorted(record_id for record_id, pk in keys.items() if pk in gone)
        if ids:
            missing[name] = ids
    return missing
