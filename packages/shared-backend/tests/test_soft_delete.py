"""Tests for ``platform_shared.repositories.soft_delete``.

Covers the full public contract:
  * Idempotency — already-deleted rows are not mutated; returns False.
  * First-delete — sets the timestamp, returns True.
  * Explicit ``deleted_at`` — caller-supplied timestamp is used verbatim.
  * Default timestamp — when no explicit timestamp is given, a UTC-aware
    datetime is stored.
  * Custom field name — ``deleted_at_field`` kwarg is honoured.
  * Session not flushed — the helper never calls ``db.flush()`` so the
    caller owns transaction control.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from platform_shared.repositories.soft_delete import soft_delete


# ---------------------------------------------------------------------------
# Minimal stand-in for an ORM model instance
# ---------------------------------------------------------------------------


@dataclass
class _FakeRow:
    """Minimal ORM-row substitute with a nullable ``deleted_at`` field."""

    deleted_at: datetime | None = None
    archived_at: datetime | None = None  # used by custom-field-name tests


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FIXED_TS = datetime(2026, 5, 8, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSoftDeleteContract:
    """Core contract tests — no session interaction needed."""

    @pytest.mark.anyio
    async def test_returns_true_on_first_delete(self) -> None:
        row = _FakeRow(deleted_at=None)
        result = await soft_delete(MagicMock(), row)
        assert result is True

    @pytest.mark.anyio
    async def test_sets_deleted_at_on_first_delete(self) -> None:
        row = _FakeRow(deleted_at=None)
        await soft_delete(MagicMock(), row)
        assert row.deleted_at is not None

    @pytest.mark.anyio
    async def test_deleted_at_is_utc_aware(self) -> None:
        row = _FakeRow(deleted_at=None)
        await soft_delete(MagicMock(), row)
        assert row.deleted_at is not None
        assert row.deleted_at.tzinfo is not None

    @pytest.mark.anyio
    async def test_returns_false_when_already_deleted(self) -> None:
        row = _FakeRow(deleted_at=_FIXED_TS)
        result = await soft_delete(MagicMock(), row)
        assert result is False

    @pytest.mark.anyio
    async def test_does_not_overwrite_existing_timestamp(self) -> None:
        row = _FakeRow(deleted_at=_FIXED_TS)
        await soft_delete(MagicMock(), row)
        assert row.deleted_at == _FIXED_TS

    @pytest.mark.anyio
    async def test_idempotent_multiple_calls(self) -> None:
        row = _FakeRow(deleted_at=None)

        first = await soft_delete(MagicMock(), row)
        assert first is True
        stamp_after_first = row.deleted_at

        second = await soft_delete(MagicMock(), row)
        assert second is False
        assert row.deleted_at == stamp_after_first


class TestExplicitTimestamp:
    @pytest.mark.anyio
    async def test_uses_caller_supplied_deleted_at(self) -> None:
        row = _FakeRow(deleted_at=None)
        custom_ts = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        await soft_delete(MagicMock(), row, deleted_at=custom_ts)
        assert row.deleted_at == custom_ts

    @pytest.mark.anyio
    async def test_caller_ts_not_used_when_already_deleted(self) -> None:
        row = _FakeRow(deleted_at=_FIXED_TS)
        later = _FIXED_TS + timedelta(hours=1)
        await soft_delete(MagicMock(), row, deleted_at=later)
        # Original timestamp preserved, NOT overwritten
        assert row.deleted_at == _FIXED_TS


class TestCustomFieldName:
    @pytest.mark.anyio
    async def test_sets_custom_field(self) -> None:
        row = _FakeRow(archived_at=None)
        result = await soft_delete(MagicMock(), row, deleted_at_field="archived_at")
        assert result is True
        assert row.archived_at is not None

    @pytest.mark.anyio
    async def test_idempotent_on_custom_field(self) -> None:
        row = _FakeRow(archived_at=_FIXED_TS)
        result = await soft_delete(MagicMock(), row, deleted_at_field="archived_at")
        assert result is False
        assert row.archived_at == _FIXED_TS


class TestSessionNotFlushed:
    """The helper must never call db.flush() or db.commit() — callers own
    transaction boundaries."""

    @pytest.mark.anyio
    async def test_flush_never_called_on_first_delete(self) -> None:
        db = AsyncMock()
        row = _FakeRow(deleted_at=None)
        await soft_delete(db, row)
        db.flush.assert_not_called()
        db.commit.assert_not_called()

    @pytest.mark.anyio
    async def test_flush_never_called_on_already_deleted(self) -> None:
        db = AsyncMock()
        row = _FakeRow(deleted_at=_FIXED_TS)
        await soft_delete(db, row)
        db.flush.assert_not_called()
        db.commit.assert_not_called()
