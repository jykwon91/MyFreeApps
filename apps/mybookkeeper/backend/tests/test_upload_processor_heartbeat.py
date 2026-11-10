"""The upload processor's heartbeat tracks its poll loop's progress.

It advances after every successful look for work and after every document
finished, so it goes stale only when the loop stops making progress — and a
busy loop never looks dead while one extraction is within its timeout.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import settings
from app.core.document_constants import EXTRACTION_TIMEOUT_SECONDS
from app.core.upload_heartbeat_too_short_error import UploadHeartbeatTooShortError
from app.core.upload_processor_constants import (
    HEARTBEAT_EXTRACTION_HEADROOM_SECONDS,
    HEARTBEAT_MAX_AGE_SECONDS,
)
from app.core.upload_processor_guard import check_heartbeat_outlasts_extraction
from app.workers import upload_processor_healthcheck, upload_processor_worker

_WORKER = "app.workers.upload_processor_worker"
_STALE = 1.0


@asynccontextmanager
async def _fake_session() -> AsyncIterator[MagicMock]:
    yield MagicMock()


@pytest.fixture
def heartbeat(tmp_path: Path) -> Iterator[Path]:
    path = tmp_path / "hb"
    with (
        patch(f"{_WORKER}.HEARTBEAT_PATH", path),
        patch(f"{_WORKER}.AsyncSessionLocal", _fake_session),
        patch(f"{_WORKER}.init_sentry", MagicMock()),
        patch(f"{_WORKER}.engine", MagicMock(dispose=AsyncMock())),
    ):
        yield path


async def test_an_idle_poll_beats(heartbeat: Path) -> None:
    with patch(f"{_WORKER}.document_repo.get_processing_user_ids", AsyncMock(return_value=[])):
        assert await upload_processor_worker.drain() == 0
    assert heartbeat.exists()


async def test_a_failed_poll_does_not_beat(heartbeat: Path) -> None:
    failing = AsyncMock(side_effect=ConnectionError("db down"))
    with (
        patch(f"{_WORKER}.document_repo.get_processing_user_ids", failing),
        pytest.raises(ConnectionError),
    ):
        await upload_processor_worker.drain()
    assert not heartbeat.exists()


async def test_each_finished_document_beats(heartbeat: Path) -> None:
    heartbeat.touch()
    mtimes: list[float] = []
    outcomes = iter([True, True, False])

    async def _process(_user_id: uuid.UUID) -> bool:
        mtimes.append(heartbeat.stat().st_mtime)
        os.utime(heartbeat, (_STALE, _STALE))
        return next(outcomes)

    with patch(f"{_WORKER}.process_one_for_user", side_effect=_process):
        assert await upload_processor_worker.drain_user(uuid.uuid4()) == 2
    # Staled before every call; the 2nd and 3rd calls see the beat from the
    # document finished just before them.
    assert mtimes[1] > _STALE
    assert mtimes[2] > _STALE


async def test_a_previous_runs_heartbeat_is_cleared_at_boot(heartbeat: Path) -> None:
    heartbeat.touch()
    failing = AsyncMock(side_effect=ConnectionError("db down"))
    with (
        patch(f"{_WORKER}.document_repo.get_processing_user_ids", failing),
        pytest.raises(ConnectionError),
    ):
        await upload_processor_worker.run_processor(asyncio.Event())
    assert not heartbeat.exists()


async def test_boot_initialises_sentry_before_polling(heartbeat: Path) -> None:
    order: list[str] = []
    stop = asyncio.Event()

    async def _user_ids(_db: object) -> list[uuid.UUID]:
        order.append("poll")
        stop.set()
        return []

    with (
        patch(f"{_WORKER}.init_sentry", MagicMock(side_effect=lambda: order.append("sentry"))),
        patch(f"{_WORKER}.document_repo.get_processing_user_ids", side_effect=_user_ids),
    ):
        await asyncio.wait_for(upload_processor_worker.run_processor(stop), timeout=5)
    assert order == ["sentry", "poll"]


async def test_boot_fails_loud_when_an_extraction_outlasts_the_heartbeat(heartbeat: Path) -> None:
    poll = AsyncMock(return_value=[])
    with (
        patch(f"{_WORKER}.EXTRACTION_TIMEOUT_SECONDS", HEARTBEAT_MAX_AGE_SECONDS),
        patch(f"{_WORKER}.document_repo.get_processing_user_ids", poll),
        pytest.raises(UploadHeartbeatTooShortError, match="CLAUDE_TIMEOUT_SECONDS"),
    ):
        await upload_processor_worker.run_processor(asyncio.Event())
    poll.assert_not_awaited()
    assert not heartbeat.exists()


async def test_stop_ends_polling_after_the_current_drain(heartbeat: Path) -> None:
    stop = asyncio.Event()
    drains: list[int] = []

    async def _drain() -> int:
        drains.append(1)
        if len(drains) == 2:
            stop.set()  # SIGTERM arrives mid-drain
        return 0

    with patch(f"{_WORKER}.drain", side_effect=_drain):
        await asyncio.wait_for(upload_processor_worker.poll_until_stopped(stop), timeout=5)
    assert len(drains) == 2


class TestExtractionFitsTheHeartbeat:
    def test_the_configured_extraction_timeout_fits(self) -> None:
        """Read from the real settings: the shipped CLAUDE_TIMEOUT_SECONDS must boot."""
        assert EXTRACTION_TIMEOUT_SECONDS == settings.claude_timeout_seconds + 30
        check_heartbeat_outlasts_extraction(EXTRACTION_TIMEOUT_SECONDS)

    def test_exactly_at_the_budget_is_allowed(self) -> None:
        check_heartbeat_outlasts_extraction(
            HEARTBEAT_MAX_AGE_SECONDS - HEARTBEAT_EXTRACTION_HEADROOM_SECONDS,
        )

    def test_one_second_over_the_budget_fails_loud(self) -> None:
        with pytest.raises(UploadHeartbeatTooShortError):
            check_heartbeat_outlasts_extraction(
                HEARTBEAT_MAX_AGE_SECONDS - HEARTBEAT_EXTRACTION_HEADROOM_SECONDS + 1,
            )


class TestHealthcheck:
    @pytest.fixture
    def path(self, tmp_path: Path) -> Iterator[Path]:
        path = tmp_path / "hb"
        with patch.object(upload_processor_healthcheck, "HEARTBEAT_PATH", path):
            yield path

    def test_fresh_heartbeat_is_healthy(self, path: Path) -> None:
        path.touch()
        assert upload_processor_healthcheck.main() == 0

    def test_missing_heartbeat_is_unhealthy(self, path: Path) -> None:
        assert upload_processor_healthcheck.main() == 1

    def test_stale_heartbeat_is_unhealthy(self, path: Path) -> None:
        path.touch()
        old = time.time() - HEARTBEAT_MAX_AGE_SECONDS - 1
        os.utime(path, (old, old))
        assert upload_processor_healthcheck.main() == 1
