"""Run a repository write on a seeded row and check the audit rows it left.

An app's tests describe each write as an :class:`AuditedWriteCase`: how to
seed the row it targets, how to make the write, and what it must record. Seeding
is the app's business (MyBookkeeper fills placeholders on SQLite; Postgres apps
insert real parents), so this module only runs the write and checks
``audit_logs``. The audit listener must be attached while it runs.
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.audit import format_record_id
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog


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
    """Seed, clear ``audit_logs``, make the write as ``actor``, then check the seeded row's audit rows."""
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


__all__ = ["AuditedWriteCase", "run_audited_write_case"]
