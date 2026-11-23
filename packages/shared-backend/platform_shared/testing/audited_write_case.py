"""Run a repository write on a seeded row and check the audit rows it left.

An app's tests describe each write as an :class:`AuditedWriteCase`: how to
seed the row it targets, how to make the write, and what it must record. Seeding
is the app's business (MyBookkeeper fills placeholders on SQLite; Postgres apps
insert real parents), so this module only runs the write and checks
``audit_logs``. A write that creates its row (an upsert's insert path) has
nothing to seed; check it with :func:`assert_row_audited` instead. The audit
listener must be attached while either runs.
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
    await db.flush()  # the listener's INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())

    with audit_actor(actor):
        await case.act(db, row)

    await assert_row_audited(
        db, row, operation=case.operation, fields=case.fields, actor=actor, label=case.name,
    )


async def assert_row_audited(
    db: AsyncSession,
    row: Any,
    *,
    operation: str,
    fields: frozenset[str],
    actor: uuid.UUID,
    label: str = "",
) -> None:
    """Check that ``row``'s audit rows are all ``operation`` by ``actor`` and cover ``fields``.

    Flushes first, because the listener's audit rows are written on the next flush.
    """
    await db.flush()
    record_id = format_record_id(inspect(row).identity)
    logs = (await db.execute(
        select(AuditLog).where(AuditLog.table_name == row.__tablename__, AuditLog.record_id == record_id),
    )).scalars().all()
    assert {log.operation for log in logs} == {operation}, f"{label}: {logs}"
    assert {log.changed_by for log in logs} == {str(actor)}
    assert fields <= {log.field_name for log in logs}


__all__ = ["AuditedWriteCase", "assert_row_audited", "run_audited_write_case"]
