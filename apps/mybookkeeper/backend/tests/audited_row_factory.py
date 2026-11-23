"""Seed a row of any model for an audited-write case (see ``platform_shared.testing.audited_write_case``).

Fills every required column that has no default with a plain value of its
type; the test passes the rest. Foreign keys get fresh UUIDs, which the test
database allows (it runs with foreign keys off).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import inspect
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
