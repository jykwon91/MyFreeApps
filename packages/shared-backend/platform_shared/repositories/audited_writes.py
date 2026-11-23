"""Conditional updates and deletes that the audit listener records.

The audit listener (:mod:`platform_shared.core.audit`) writes ``audit_logs``
rows from the ORM unit of work on flush. A bulk ``update(Model)`` or
``delete(Model)`` statement runs straight against the database, so nothing it
changes is ever audited. These helpers make the same change through the ORM
instead: they load the rows the criteria match, change or delete them as ORM
objects, and flush, so the listener sees each one.

The rows are read ``FOR UPDATE``, so a conditional write keeps the guarantee
the single conditional ``UPDATE`` gave. On Postgres a second writer with the
same criteria waits on the row lock, then re-checks the criteria against the
committed row, exactly as a second ``UPDATE ... WHERE status = 'pending'``
would: of two concurrent claims only one matches. (``SKIP LOCKED`` would differ:
the second writer would find no row even if the first then rolled back.)
SQLite has no row locks and ignores ``FOR UPDATE``; it serialises writers on
the whole database instead.

The rows are read with ``populate_existing``, so an object the caller already
holds for one of them is refreshed from the database rather than left stale.
"""
from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import ColumnElement, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_rows[ModelT](
    db: AsyncSession, model: type[ModelT], *criteria: ColumnElement[bool],
) -> list[ModelT]:
    """The rows of ``model`` matching ``criteria``, locked for update and freshly read."""
    result = await db.execute(
        select(model)
        .where(*criteria)
        .with_for_update(of=model)
        .execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


async def update_rows[ModelT](
    db: AsyncSession,
    model: type[ModelT],
    *criteria: ColumnElement[bool],
    values: Mapping[str, object],
) -> list[ModelT]:
    """Set ``values`` on every row of ``model`` matching ``criteria``; return the rows changed.

    ``values`` are plain values, not SQL expressions: the audit row records what
    was written. Raises ``ValueError`` for a name that is no column of ``model``.
    """
    columns = {attr.key for attr in inspect(model).column_attrs}
    unknown = sorted(set(values) - columns)
    if unknown:
        raise ValueError(f"{model.__name__} has no columns {unknown}")
    rows = await lock_rows(db, model, *criteria)
    for row in rows:
        for name, value in values.items():
            setattr(row, name, value)
    await db.flush()
    return rows


async def delete_rows[ModelT](
    db: AsyncSession, model: type[ModelT], *criteria: ColumnElement[bool],
) -> list[ModelT]:
    """Delete every row of ``model`` matching ``criteria``; return the rows deleted.

    Rows that the database deletes by ``ON DELETE CASCADE`` from these are
    removed by the database, not the session, as with any ORM delete.
    """
    rows = await lock_rows(db, model, *criteria)
    for row in rows:
        await db.delete(row)
    await db.flush()
    return rows


__all__ = ["delete_rows", "lock_rows", "update_rows"]
