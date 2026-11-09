"""The replace path locks the template row and bumps its version in SQL.

SQLite cannot exercise row locks or concurrent writers, so these assert on the
statements compiled for PostgreSQL, which is what runs in production.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.repositories.leases import lease_template_repo


def _compiled(statement: object) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))  # type: ignore[attr-defined]


async def _executed_statement(call) -> object:
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(rowcount=1))
    await call(db)
    return db.execute.call_args.args[0]


def _ids() -> dict[str, uuid.UUID]:
    return {"template_id": uuid.uuid4(), "user_id": uuid.uuid4(), "organization_id": uuid.uuid4()}


@pytest.mark.asyncio
async def test_get_for_update_emits_for_update() -> None:
    stmt = await _executed_statement(lambda db: lease_template_repo.get(db, for_update=True, **_ids()))

    assert "FOR UPDATE" in _compiled(stmt)


@pytest.mark.asyncio
async def test_get_does_not_lock_by_default() -> None:
    stmt = await _executed_statement(lambda db: lease_template_repo.get(db, **_ids()))

    assert "FOR UPDATE" not in _compiled(stmt)


@pytest.mark.asyncio
async def test_bump_version_increments_in_sql() -> None:
    stmt = await _executed_statement(lambda db: lease_template_repo.bump_version(db, **_ids()))

    sql = _compiled(stmt)
    assert "UPDATE lease_templates SET version=(lease_templates.version + %(version_1)s)" in sql
