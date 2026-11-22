"""Migration ``0007`` redacts tutor transcript text already in audit_logs.

Rows are inserted with raw SQL to stand in for what the listener wrote before
the transcript columns were masked, then the migration's redaction runs.
"""
from __future__ import annotations

import importlib.util
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path
from types import ModuleType

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from platform_shared.core.audit_constants import SENSITIVE_VALUE_MASK

_MIGRATION = (
    Path(__file__).parent.parent / "alembic" / "versions" / "0007_redact_tutor_turn_audit_values.py"
)

# (table, operation, field, old_value, new_value) as written before the fix.
_ROWS = [
    ("tutor_turn", "INSERT", "learner_text", None, "quiero un cafe"),
    ("tutor_turn", "INSERT", "reply_text", None, None),
    ("tutor_turn", "UPDATE", "reply_text", None, "¡Claro!"),
    ("tutor_turn", "UPDATE", "corrections_json", "{}", '{"corrections": []}'),
    ("tutor_turn", "UPDATE", "translation_text", "Sure", "Of course!"),
    ("tutor_turn", "DELETE", "learner_text", "quiero un cafe", None),
    ("tutor_turn", "UPDATE", "status", "partial", "complete"),
    ("tutor_session", "INSERT", "learner_text", None, "not a transcript column"),
]
_EXPECTED = [
    (None, SENSITIVE_VALUE_MASK),
    (None, None),
    (None, SENSITIVE_VALUE_MASK),
    (SENSITIVE_VALUE_MASK, SENSITIVE_VALUE_MASK),
    (SENSITIVE_VALUE_MASK, SENSITIVE_VALUE_MASK),
    (SENSITIVE_VALUE_MASK, None),
    ("partial", "complete"),
    (None, "not a transcript column"),
]


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("mlt_0007", _MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest_asyncio.fixture()
async def audit_rows(db_engine: AsyncEngine) -> AsyncGenerator[str, None]:
    record_id = f"migration-test-{uuid.uuid4()}"
    async with db_engine.begin() as conn:
        for table, operation, field, old, new in _ROWS:
            await conn.execute(
                text(
                    "INSERT INTO audit_logs (table_name, record_id, operation, field_name, "
                    "old_value, new_value) VALUES (:t, :r, :o, :f, :old, :new)"
                ),
                {"t": table, "r": record_id, "o": operation, "f": field, "old": old, "new": new},
            )
    yield record_id
    async with db_engine.begin() as conn:
        await conn.execute(text("DELETE FROM audit_logs WHERE record_id = :r"), {"r": record_id})


async def _values(engine: AsyncEngine, record_id: str) -> list[tuple[str | None, str | None]]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT old_value, new_value FROM audit_logs WHERE record_id = :r ORDER BY id"),
            {"r": record_id},
        )
        return [(row.old_value, row.new_value) for row in rows]


@pytest.mark.asyncio
async def test_redacts_transcripts_and_keeps_the_rows(
    db_engine: AsyncEngine, audit_rows: str,
) -> None:
    migration = _load_migration()
    async with db_engine.begin() as conn:
        await conn.run_sync(migration.redact_tutor_turn_audit_values)

    assert await _values(db_engine, audit_rows) == _EXPECTED


@pytest.mark.asyncio
async def test_running_again_changes_nothing(db_engine: AsyncEngine, audit_rows: str) -> None:
    migration = _load_migration()
    for _ in range(2):
        async with db_engine.begin() as conn:
            await conn.run_sync(migration.redact_tutor_turn_audit_values)

    assert await _values(db_engine, audit_rows) == _EXPECTED

