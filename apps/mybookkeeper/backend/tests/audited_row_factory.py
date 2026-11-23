"""Seed a row of any model, run a repository write on it, check its audit rows.

Fills every required column that has no default with a plain value of its
type; the test passes the rest. Foreign keys get fresh UUIDs, which the test
database allows (it runs with foreign keys off).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from platform_shared.core.audit import format_record_id
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

def _placeholder(python_type: type) -> object:
    if python_type is uuid.UUID:
        return uuid.uuid4()
    if python_type is bool:
        return False
    if python_type is int:
        return 1
    if python_type is Decimal:
        return Decimal("1.00")
    if python_type is _dt.datetime:
        return _dt.datetime(2026, 1, 1, tzinfo=_dt.UTC)
    if python_type is _dt.date:
        return _dt.date(2026, 1, 1)
    if python_type in (dict, list):
        return python_type()
    return "x"


async def make_row[ModelT](db: AsyncSession, model: type[ModelT], **fields: object) -> ModelT:
    """Insert a ``model`` row with ``fields`` plus placeholders for the other required columns."""
    for column in inspect(model).columns:
        if column.key in fields or column.nullable or column.primary_key:
            continue
        if column.default is not None or column.server_default is not None:
            continue
        fields[column.key] = _placeholder(column.type.python_type)
    row = model(**fields)
    db.add(row)
    await db.flush()
    return row


@dataclass(frozen=True)
class AuditedWriteCase:
    """A repository write and what it must leave in ``audit_logs``.

    ``seed`` inserts the row the write targets; ``act`` makes the write;
    ``fields`` are the columns an UPDATE must record (a DELETE records them all).
    """

    name: str
    seed: Callable[[AsyncSession], Awaitable[Any]]
    act: Callable[[AsyncSession, Any], Awaitable[object]]
    operation: str
    fields: frozenset[str] = frozenset()


async def run_audited_write_case(db: AsyncSession, case: AuditedWriteCase, actor: uuid.UUID) -> None:
    row = await case.seed(db)
    table = row.__tablename__
    record_id = format_record_id(inspect(row).identity)
    await db.flush()  # the listener's INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())

    with audit_actor(actor):
        await case.act(db, row)
    await db.flush()

    logs = (await db.execute(
        select(AuditLog).where(AuditLog.table_name == table, AuditLog.record_id == record_id),
    )).scalars().all()
    assert {log.operation for log in logs} == {case.operation}, f"{case.name}: {logs}"
    assert {log.changed_by for log in logs} == {str(actor)}
    assert case.fields <= {log.field_name for log in logs}
