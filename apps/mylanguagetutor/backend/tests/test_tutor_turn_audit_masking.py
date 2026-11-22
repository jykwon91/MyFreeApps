"""Tutor transcripts never reach audit_logs as text.

The shared audit listener copies the decrypted attribute value of every column
it audits, so the encrypted tutor_turn transcript columns must be masked. A real
turn is driven through ``POST /sessions/{id}/turns`` (insert at the start,
update when it settles) and its audit rows are read back.

ASGITransport doesn't run the lifespan, so the listener is attached here and
detached afterwards, with every audit row the test wrote deleted.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.audit import (
    APP_SENSITIVE_FIELDS,
    APP_SKIP_FIELDS,
    APP_SKIP_TABLES,
    register_audit_listeners,
)
from app.core.config import settings
from platform_shared.core.audit import (
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
    reset_registry,
)
from platform_shared.core.audit_constants import SENSITIVE_VALUE_MASK

_TRANSCRIPT_FIELDS = ("learner_text", "reply_text", "corrections_json", "translation_text")
_LEARNER_TEXT = "hola, quiero un cafe con leche"


async def _fetch(sql: str, **params: Any) -> list[Any]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            return list((await conn.execute(text(sql), params)).all())
    finally:
        await engine.dispose()


@pytest_asyncio.fixture()
async def audit_listener() -> AsyncGenerator[None, None]:
    last_id = (await _fetch("SELECT COALESCE(MAX(id), 0) FROM audit_logs"))[0][0]
    register_audit_listeners()
    try:
        yield
    finally:
        # Detach, then restore the import-time registrations so the rest of the
        # suite runs exactly as before.
        reset_registry()
        register_sensitive_fields(APP_SENSITIVE_FIELDS)
        register_skip_tables(APP_SKIP_TABLES)
        register_skip_fields(APP_SKIP_FIELDS)
        await _fetch("DELETE FROM audit_logs WHERE id > :last_id RETURNING id", last_id=last_id)


async def _run_turn(authed: AsyncClient) -> str:
    resp = await authed.post(
        "/sessions", json={"language_code": "es", "scenario_slug": "cafe", "level": "beginner"},
    )
    assert resp.status_code == 201, resp.text
    session_id = resp.json()["id"]
    turn = await authed.post(f"/sessions/{session_id}/turns", json={"text": _LEARNER_TEXT})
    assert turn.status_code == 200, turn.text
    rows = await _fetch(
        "SELECT id FROM tutor_turn WHERE session_id = :sid", sid=uuid.UUID(session_id),
    )
    assert len(rows) == 1
    return str(rows[0][0])


@pytest.mark.asyncio
async def test_turn_insert_and_update_write_masked_transcripts(
    user_factory, as_user, fake_claude, audit_listener,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        turn_id = await _run_turn(authed)

    rows = await _fetch(
        "SELECT operation, field_name, old_value, new_value FROM audit_logs "
        "WHERE table_name = 'tutor_turn' AND record_id = :rid",
        rid=turn_id,
    )
    transcript_rows = [r for r in rows if r.field_name in _TRANSCRIPT_FIELDS]

    inserted = {r.field_name for r in transcript_rows if r.operation == "INSERT"}
    updated = {r.field_name for r in transcript_rows if r.operation == "UPDATE"}
    # The insert carries the learner's text; the reply side arrives on settle.
    assert "learner_text" in inserted
    assert {"reply_text", "corrections_json", "translation_text"} <= updated

    for row in transcript_rows:
        for value in (row.old_value, row.new_value):
            assert value in (None, SENSITIVE_VALUE_MASK), (row.operation, row.field_name, value)
    learner_insert = next(
        r for r in transcript_rows if r.operation == "INSERT" and r.field_name == "learner_text"
    )
    assert learner_insert.new_value == SENSITIVE_VALUE_MASK

    # No transcript text anywhere in the turn's audit trail.
    spoken = (_LEARNER_TEXT, "¿Qué quieres tomar?", fake_claude.translation_text)
    for row in rows:
        for value in (row.old_value, row.new_value):
            assert not any(s in (value or "") for s in spoken), (row.field_name, value)
    # Unencrypted columns are still audited as normal.
    assert any(r.field_name == "status" and r.new_value == "complete" for r in rows)
