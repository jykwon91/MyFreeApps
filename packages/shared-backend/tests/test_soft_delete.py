"""Tests for platform_shared.repositories.soft_delete."""
from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from platform_shared.repositories.soft_delete import soft_delete


@dataclass
class _FakeInstance:
    deleted_at: datetime | None = None
    custom_removed_at: datetime | None = None


class _FakeSession:
    """Minimal async session stub — tracks add calls, does not commit."""

    def __init__(self) -> None:
        self.added: list[Any] = []
        self.flush_call_count = 0

    def add(self, instance: Any) -> None:
        self.added.append(instance)

    async def flush(self) -> None:
        self.flush_call_count += 1


@pytest.mark.asyncio
async def test_first_soft_delete_sets_deleted_at_and_returns_true() -> None:
    db = _FakeSession()
    instance = _FakeInstance(deleted_at=None)

    result = await soft_delete(db, instance)

    assert result is True
    assert instance.deleted_at is not None
    assert instance.deleted_at.tzinfo is not None  # timezone-aware


@pytest.mark.asyncio
async def test_first_soft_delete_sets_utc_timestamp() -> None:
    db = _FakeSession()
    instance = _FakeInstance(deleted_at=None)
    before = datetime.now(timezone.utc)

    await soft_delete(db, instance)

    after = datetime.now(timezone.utc)
    assert before <= instance.deleted_at <= after  # type: ignore[operator]


@pytest.mark.asyncio
async def test_second_call_is_noop_and_returns_false() -> None:
    db = _FakeSession()
    original_ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
    instance = _FakeInstance(deleted_at=original_ts)

    result = await soft_delete(db, instance)

    assert result is False
    assert instance.deleted_at is original_ts  # timestamp NOT overwritten


@pytest.mark.asyncio
async def test_second_call_does_not_flush() -> None:
    db = _FakeSession()
    original_ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
    instance = _FakeInstance(deleted_at=original_ts)

    await soft_delete(db, instance)

    assert db.flush_call_count == 0


@pytest.mark.asyncio
async def test_first_call_flushes_once() -> None:
    db = _FakeSession()
    instance = _FakeInstance(deleted_at=None)

    await soft_delete(db, instance)

    assert db.flush_call_count == 1


@pytest.mark.asyncio
async def test_first_call_adds_instance_to_session() -> None:
    db = _FakeSession()
    instance = _FakeInstance(deleted_at=None)

    await soft_delete(db, instance)

    assert instance in db.added


@pytest.mark.asyncio
async def test_custom_deleted_at_field() -> None:
    db = _FakeSession()
    instance = _FakeInstance(custom_removed_at=None)

    result = await soft_delete(db, instance, deleted_at_field="custom_removed_at")

    assert result is True
    assert instance.custom_removed_at is not None


@pytest.mark.asyncio
async def test_custom_deleted_at_field_idempotency() -> None:
    db = _FakeSession()
    original_ts = datetime(2024, 6, 1, tzinfo=timezone.utc)
    instance = _FakeInstance(custom_removed_at=original_ts)

    result = await soft_delete(db, instance, deleted_at_field="custom_removed_at")

    assert result is False
    assert instance.custom_removed_at is original_ts


@pytest.mark.asyncio
async def test_does_not_commit() -> None:
    """Helper must NOT commit — caller owns the transaction boundary."""
    commit_mock = AsyncMock()
    db = _FakeSession()
    db.commit = commit_mock  # type: ignore[attr-defined]
    instance = _FakeInstance(deleted_at=None)

    await soft_delete(db, instance)

    commit_mock.assert_not_called()
