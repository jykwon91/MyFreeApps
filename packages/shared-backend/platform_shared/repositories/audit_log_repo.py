"""Writes to ``audit_logs`` beyond the listener's own inserts.

The table is append-only except for erasure: when an account is deleted, the
values its rows captured are overwritten with
:data:`~platform_shared.core.audit_erasure_constants.ERASED_AUDIT_VALUE`. NULLs
and the listener's ``"***"`` mask are left as they are. The table, record id,
field, operation, actor and time stay, so the trail still shows that something
changed, and when, without what it said.
"""
from __future__ import annotations

from collections.abc import Collection, Sequence

from sqlalchemy import case, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from platform_shared.core.audit_erasure_constants import (
    ERASED_AUDIT_VALUE,
    IN_CLAUSE_CHUNK_SIZE,
    MASKED_AUDIT_VALUE,
)
from platform_shared.db.models.audit_log import AuditLog


async def write_pending(db: AsyncSession) -> None:
    """Write the session's pending changes and the audit rows they produce.

    The listener adds its rows during a flush, so they wait for the next one.
    The second flush writes them, so an erasure run afterwards reaches them.
    """
    await db.flush()
    await db.flush()


def _erased(column: InstrumentedAttribute[str | None]) -> ColumnElement[str | None]:
    return case(
        (column.is_(None), None),
        (column == MASKED_AUDIT_VALUE, MASKED_AUDIT_VALUE),
        else_=ERASED_AUDIT_VALUE,
    )


async def _erase(db: AsyncSession, where: ColumnElement[bool]) -> None:
    await db.execute(
        update(AuditLog)
        .where(where)
        .values(old_value=_erased(AuditLog.old_value), new_value=_erased(AuditLog.new_value))
        .execution_options(synchronize_session=False),
    )


async def erase_record_history(db: AsyncSession, table_name: str, record_ids: Sequence[str]) -> None:
    """Erase the values of every audit row about these records of ``table_name``."""
    for start in range(0, len(record_ids), IN_CLAUSE_CHUNK_SIZE):
        chunk = record_ids[start:start + IN_CLAUSE_CHUNK_SIZE]
        await _erase(db, (AuditLog.table_name == table_name) & AuditLog.record_id.in_(chunk))


async def authored_records(
    db: AsyncSession, actor_id: str, except_tables: Collection[str],
) -> dict[str, list[str]]:
    """Record ids, per table, that ``actor_id`` has audit rows about, outside ``except_tables``."""
    query = select(AuditLog.table_name, AuditLog.record_id).distinct().where(AuditLog.changed_by == actor_id)
    if except_tables:
        query = query.where(AuditLog.table_name.not_in(list(except_tables)))
    records: dict[str, list[str]] = {}
    for table_name, record_id in (await db.execute(query)).all():
        records.setdefault(table_name, []).append(record_id)
    return records


async def erase_authored(db: AsyncSession, actor_id: str, table_name: str, record_ids: Sequence[str]) -> None:
    """Erase the values of the audit rows ``actor_id`` wrote about these records of ``table_name``."""
    for start in range(0, len(record_ids), IN_CLAUSE_CHUNK_SIZE):
        chunk = record_ids[start:start + IN_CLAUSE_CHUNK_SIZE]
        await _erase(db, (
            (AuditLog.changed_by == actor_id)
            & (AuditLog.table_name == table_name)
            & AuditLog.record_id.in_(chunk)
        ))
