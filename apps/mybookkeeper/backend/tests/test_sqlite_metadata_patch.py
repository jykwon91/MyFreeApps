"""Regression contract for ``conftest._patch_metadata_for_sqlite``.

The patch swaps PostgreSQL-only column types for SQLite-compatible ones so the
in-memory test database can hold the production schema. It has to run before
any test module is imported: SQLAlchemy memoizes a column's comparator the
first time an expression touches it, and a JSONB comparator renders
``contains()`` as the PostgreSQL-only ``@>`` operator, which SQLite rejects
with ``unrecognized token: "@"``. Reassigning the column type afterwards does
not undo that memoization.

Left to a session-scoped fixture, the patch ran only once the first database
test started, so whether an expression came out portable depended on collection
order and on how pytest-xdist sharded the run — a flake that moved whenever
tests were added.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB

from app.db.base import Base
from app.models.transactions.transaction import Transaction

_POSTGRES_ONLY_TYPES = (JSONB, INET, ARRAY)


class TestMetadataIsSqliteCompatible:
    def test_the_patch_ran_before_this_module_was_imported(self) -> None:
        # If this is empty the patch never ran at all — every other assertion
        # here would pass vacuously.
        assert len(Base.metadata.tables) > 0

    def test_no_postgres_only_column_types_remain(self) -> None:
        offenders = [
            f"{table.name}.{column.name} ({type(column.type).__name__})"
            for table in Base.metadata.tables.values()
            for column in table.columns
            if isinstance(column.type, _POSTGRES_ONLY_TYPES)
        ]
        assert offenders == []

    def test_json_containment_compiles_to_portable_sql(self) -> None:
        # The specific expression that used to compile to `tags @> ?`.
        sql = str(select(Transaction).where(Transaction.tags.contains(["airbnb"])))
        assert "@>" not in sql

    @pytest.mark.asyncio
    async def test_json_containment_actually_executes_on_the_fixture(self, db) -> None:
        # Compiling is not enough — SQLite has to accept the statement too.
        rows = (await db.execute(
            select(Transaction).where(Transaction.tags.contains(["airbnb"])),
        )).scalars().all()
        assert rows == []
