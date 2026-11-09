"""Every write that must not interleave takes a row lock (SELECT ... FOR UPDATE).

The lock is what serializes the add-cap count, ``next_display_order`` and a
reorder, and what stops a concurrent delete from turning a later write into a
StaleDataError (a 500). SQLite ignores FOR UPDATE, so the in-memory suite can't
see a missing lock: these tests compile each statement for PostgreSQL and read
the SQL instead, and the locking itself is only really exercised on Postgres.

A section-level write locks the manual; a field/image write locks the section.
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.repositories import welcome_manual_repo, welcome_manual_section_repo
from app.services.welcome_manuals import (
    welcome_manual_section_field_service as fields,
    welcome_manual_section_image_service as images,
    welcome_manual_section_service as sections,
)

ORG, USER, MANUAL, SECTION, ROW = (uuid.uuid4() for _ in range(5))


class _Stop(Exception):
    pass


class _RecordingDb:
    """Records the PostgreSQL SQL of each statement. Answers the scope lookups
    with a row, then stops the service on the statement after the locks."""

    def __init__(self, statements_before_stop: int) -> None:
        self.sql: list[str] = []
        self._allowed = statements_before_stop

    async def execute(self, query):
        if len(self.sql) >= self._allowed:
            raise _Stop
        self.sql.append(str(query.compile(dialect=postgresql.dialect())))
        row = SimpleNamespace(id=MANUAL if len(self.sql) == 1 else SECTION)
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        return result

    async def flush(self) -> None:
        """Reached only by a write that locked what it needed and went on to change it."""
        raise _Stop


def _locks(sql: str) -> bool:
    return "FOR UPDATE" in sql


async def _run(monkeypatch: pytest.MonkeyPatch, module, call: Callable[[], Awaitable[object]], statements: int) -> list[str]:
    db = _RecordingDb(statements)

    @asynccontextmanager
    async def _uow():
        yield db

    monkeypatch.setattr(module, "unit_of_work", _uow)
    with pytest.raises(_Stop):
        await call()
    return db.sql


def _jpeg() -> list[tuple[bytes, str, str]]:
    return [(b"x", "a.jpg", "image/jpeg")]


# (module, call) for each write that locks the MANUAL (lookup 1), nothing else first.
MANUAL_LOCKED = {
    "add_section": (sections, lambda: sections.add_section(ORG, USER, MANUAL, title="t", body=None)),
    "reorder_sections": (sections, lambda: sections.reorder_sections(ORG, USER, MANUAL, [ROW])),
    "delete_section": (sections, lambda: sections.delete_section(ORG, USER, MANUAL, SECTION)),
}

# (module, call) for each write that locks the SECTION (lookup 2) after reading the manual.
SECTION_LOCKED = {
    "update_section": (sections, lambda: sections.update_section(ORG, USER, MANUAL, SECTION, {"title": "x"})),
    "add_field": (fields, lambda: fields.add_field(ORG, USER, MANUAL, SECTION, "l", None)),
    "update_field": (fields, lambda: fields.update_field(ORG, USER, MANUAL, SECTION, ROW, {"label": "x"})),
    "reorder_fields": (fields, lambda: fields.reorder_fields(ORG, USER, MANUAL, SECTION, [ROW])),
    "delete_field": (fields, lambda: fields.delete_field(ORG, USER, MANUAL, SECTION, ROW)),
    "upload_images": (images, lambda: images.upload_images(ORG, USER, MANUAL, SECTION, _jpeg())),
    "update_image": (images, lambda: images.update_image(ORG, USER, MANUAL, SECTION, ROW, {"caption": "c"})),
    "reorder_images": (images, lambda: images.reorder_images(ORG, USER, MANUAL, SECTION, [ROW])),
    "delete_image": (images, lambda: images.delete_image(ORG, USER, MANUAL, SECTION, ROW)),
}


@pytest.mark.parametrize("name", MANUAL_LOCKED)
@pytest.mark.asyncio
async def test_section_writes_lock_the_manual(name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    module, call = MANUAL_LOCKED[name]
    sql = await _run(monkeypatch, module, call, statements=1)
    assert _locks(sql[0]), f"{name} must lock the manual row"


@pytest.mark.parametrize("name", SECTION_LOCKED)
@pytest.mark.asyncio
async def test_field_and_image_writes_lock_the_section(name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    module, call = SECTION_LOCKED[name]
    if name == "upload_images":
        monkeypatch.setattr(images, "get_storage", lambda: object())
        monkeypatch.setattr(images, "process_image", lambda content, declared_content_type=None: SimpleNamespace(content=content, content_type="image/jpeg"))
    sql = await _run(monkeypatch, module, call, statements=2)
    assert "welcome_manual_sections" in sql[1]
    assert _locks(sql[1]), f"{name} must lock the section row"
    assert not _locks(sql[0]), f"{name} only needs to read the manual"


@pytest.mark.asyncio
async def test_delete_section_also_locks_the_section_it_removes(monkeypatch: pytest.MonkeyPatch) -> None:
    module, call = MANUAL_LOCKED["delete_section"]
    sql = await _run(monkeypatch, module, call, statements=2)
    assert _locks(sql[0]) and _locks(sql[1])


class _CapturingDb:
    def __init__(self) -> None:
        self.sql = ""

    async def execute(self, query):
        self.sql = str(query.compile(dialect=postgresql.dialect()))
        raise _Stop


@pytest.mark.parametrize("repo", [welcome_manual_repo, welcome_manual_section_repo])
@pytest.mark.parametrize(("flag", "locked"), [(False, False), (True, True)])
@pytest.mark.asyncio
async def test_get_by_id_locks_only_when_asked(repo, flag: bool, locked: bool) -> None:
    db = _CapturingDb()
    args = (uuid.uuid4(), uuid.uuid4())
    with pytest.raises(_Stop):
        await repo.get_by_id(db, *args, for_update=flag)  # type: ignore[arg-type]
    assert _locks(db.sql) is locked
