"""Conditional updates, deletes and upserts that the audit listener records.

The audit listener (:mod:`platform_shared.core.audit`) writes ``audit_logs``
rows from the ORM unit of work on flush. A bulk ``update(Model)`` or
``delete(Model)`` statement, or an ``INSERT ... ON CONFLICT`` upsert, runs
straight against the database, so nothing it changes is ever audited. These
helpers make the same change through the ORM instead: they load the rows the
criteria match, change, delete or insert them as ORM objects, and flush, so the
listener sees each one.

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

The upserts (:func:`upsert_row`, :func:`insert_if_absent`) keep the guarantee an
``ON CONFLICT`` clause gave: two writers inserting the same key both succeed and
end up on one row. The insert runs inside a SAVEPOINT. When a concurrent writer
committed the same key first, the unique violation rolls back only the
SAVEPOINT, and the helper carries on with the winner's row. Their criteria must
select the row by the unique key the conflict would have been on.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping

from sqlalchemy import ColumnElement, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_rows[ModelT](
    db: AsyncSession, model: type[ModelT], *criteria: ColumnElement[bool],
) -> list[ModelT]:
    """The rows of ``model`` matching ``criteria``, locked for update and freshly read.

    Rows are locked in primary-key order, so two writers locking overlapping rows
    take the locks in the same order and cannot deadlock each other.
    """
    result = await db.execute(
        select(model)
        .where(*criteria)
        .order_by(*inspect(model).primary_key)
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
    _require_columns(model, values)
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


async def upsert_row[ModelT](
    db: AsyncSession,
    model: type[ModelT],
    *criteria: ColumnElement[bool],
    create: Mapping[str, object],
    update: Mapping[str, object],
) -> tuple[ModelT, bool]:
    """Set ``update`` on the row of ``model`` matching ``criteria``, or insert
    ``model(**create)`` when there is none. Returns ``(row, created)``.

    The ORM equivalent of ``INSERT ... ON CONFLICT (<key>) DO UPDATE``:
    ``criteria`` select the row by that unique key. An existing row is locked
    ``FOR UPDATE`` first, as the conflicting row of ``DO UPDATE`` is. Only the
    columns whose value actually changes are written (and audited), so an
    ``update`` that changes nothing writes nothing. Raises ``ValueError`` for a
    name that is no column of ``model``, or when ``criteria`` match more than one row.
    """
    _require_columns(model, create)
    _require_columns(model, update)
    row = await _lock_one(db, model, criteria)
    if row is None:
        try:
            return await _insert_in_savepoint(db, model, create), True
        except IntegrityError:
            row = await _lock_one(db, model, criteria)
            if row is None:
                raise  # not a conflict on the key: some other constraint failed
    for name, value in update.items():
        setattr(row, name, value)
    await db.flush()
    return row, False


async def insert_if_absent[ModelT](
    db: AsyncSession,
    model: type[ModelT],
    *criteria: ColumnElement[bool],
    create: Mapping[str, object],
) -> ModelT | None:
    """Insert ``model(**create)`` unless a row matching ``criteria`` exists.
    Returns the inserted row, or None when one already existed.

    The ORM equivalent of ``INSERT ... ON CONFLICT (<key>) DO NOTHING``:
    ``criteria`` select the row by that unique key. As with ``DO NOTHING``, an
    existing row is neither changed nor locked. Raises ``ValueError`` for a name
    that is no column of ``model``.
    """
    _require_columns(model, create)
    if await _exists(db, model, criteria):
        return None
    try:
        return await _insert_in_savepoint(db, model, create)
    except IntegrityError:
        if not await _exists(db, model, criteria):
            raise  # not a conflict on the key: some other constraint failed
        return None


def _require_columns(model: type, names: Iterable[str]) -> None:
    columns = {attr.key for attr in inspect(model).column_attrs}
    unknown = sorted(set(names) - columns)
    if unknown:
        raise ValueError(f"{model.__name__} has no columns {unknown}")


async def _lock_one[ModelT](
    db: AsyncSession, model: type[ModelT], criteria: tuple[ColumnElement[bool], ...],
) -> ModelT | None:
    rows = await lock_rows(db, model, *criteria)
    if len(rows) > 1:
        raise ValueError(f"{model.__name__}: the upsert criteria matched {len(rows)} rows, not one")
    return rows[0] if rows else None


async def _exists(db: AsyncSession, model: type, criteria: tuple[ColumnElement[bool], ...]) -> bool:
    return bool(await db.scalar(select(select(model).where(*criteria).exists())))


async def _insert_in_savepoint[ModelT](
    db: AsyncSession, model: type[ModelT], create: Mapping[str, object],
) -> ModelT:
    """Insert ``model(**create)`` inside a SAVEPOINT, so a unique violation
    rolls back only this insert and leaves the session usable."""
    row = model(**create)
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        # The SAVEPOINT rollback usually evicts the pending row already;
        # expunging it again would raise and hide the IntegrityError.
        if inspect(row).session_id is not None:
            db.expunge(row)
        raise
    return row


__all__ = ["delete_rows", "insert_if_absent", "lock_rows", "update_rows", "upsert_row"]
