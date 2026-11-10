"""The scheduler worker's heartbeat means "alive", never "sleeping" or "busy".

Ticks are up to an hour apart and a Gmail sync can run for minutes, so the
heartbeat must keep advancing while the loop waits for the next tick and while
a long tick runs — otherwise the healthcheck would flag a healthy worker. The
healthcheck itself reads only the heartbeat file.
"""
from __future__ import annotations

import asyncio
import os
import time
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from platform_shared.core.boot_guards import TransparencyNotConfiguredError

from app.core.config import settings
from app.core.scheduler_worker_constants import (
    HEARTBEAT_INTERVAL_SECONDS,
    HEARTBEAT_MAX_AGE_SECONDS,
)
from app.workers import scheduler_healthcheck, scheduler_worker

_WORKER = "app.workers.scheduler_worker"
_STALE = 1.0  # an mtime far in the past


@pytest.fixture
def heartbeat(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    monkeypatch.setattr(settings, "transparency_primary", False)
    path = tmp_path / "hb"
    with (
        patch(f"{_WORKER}.HEARTBEAT_PATH", path),
        patch(f"{_WORKER}.HEARTBEAT_INTERVAL_SECONDS", 0.01),
        patch(f"{_WORKER}.init_sentry", MagicMock()),
        patch(f"{_WORKER}.engine", MagicMock(dispose=AsyncMock())),
    ):
        yield path


def _mark_stale(path: Path) -> None:
    os.utime(path, (_STALE, _STALE))


async def _run(stop: asyncio.Event) -> None:
    await asyncio.wait_for(scheduler_worker.run_scheduler(stop), timeout=5)


async def test_heartbeat_advances_during_a_long_tick(heartbeat: Path) -> None:
    stop = asyncio.Event()
    seen: list[float] = []

    async def _long_tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
        _mark_stale(heartbeat)
        await asyncio.sleep(0.2)  # a Gmail sync still running
        seen.append(heartbeat.stat().st_mtime)
        stop.set()
        return False

    with patch(f"{_WORKER}.run_tick", side_effect=_long_tick):
        await _run(stop)
    assert seen[0] > _STALE


async def test_heartbeat_advances_while_waiting_for_the_next_tick(heartbeat: Path) -> None:
    stop = asyncio.Event()
    seen: list[float] = []

    async def _tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
        _mark_stale(heartbeat)
        return False

    async def _sleep_until_next_tick(_stop: asyncio.Event, _timeout: float) -> None:
        await asyncio.sleep(0.2)
        seen.append(heartbeat.stat().st_mtime)
        stop.set()

    with (
        patch(f"{_WORKER}.run_tick", side_effect=_tick),
        patch(f"{_WORKER}.wait_or_stop", side_effect=_sleep_until_next_tick),
    ):
        await _run(stop)
    assert seen[0] > _STALE


async def test_heartbeat_is_written_before_the_first_tick(heartbeat: Path) -> None:
    """The deploy waits ~150s for health; the first full sync may take longer."""
    stop = asyncio.Event()
    existed: list[bool] = []

    async def _tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
        existed.append(heartbeat.exists())
        stop.set()
        return False

    with patch(f"{_WORKER}.run_tick", side_effect=_tick):
        await _run(stop)
    assert existed == [True]


async def test_heartbeat_stops_once_the_loop_exits(heartbeat: Path) -> None:
    stop = asyncio.Event()
    stop.set()
    await _run(stop)
    _mark_stale(heartbeat)
    await asyncio.sleep(0.1)
    assert heartbeat.stat().st_mtime == _STALE


async def test_a_previous_runs_heartbeat_is_cleared_at_boot(
    heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    heartbeat.touch()
    monkeypatch.setattr(settings, "transparency_primary", True)
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "minio_endpoint", "")
    with pytest.raises(TransparencyNotConfiguredError, match="MINIO_ENDPOINT"):
        await _run(asyncio.Event())
    assert not heartbeat.exists()


class TestHealthcheck:
    @pytest.fixture
    def path(self, tmp_path: Path) -> Iterator[Path]:
        path = tmp_path / "hb"
        with patch.object(scheduler_healthcheck, "HEARTBEAT_PATH", path):
            yield path

    def test_fresh_heartbeat_is_healthy(self, path: Path) -> None:
        path.touch()
        assert scheduler_healthcheck.main() == 0

    def test_missing_heartbeat_is_unhealthy(self, path: Path) -> None:
        assert scheduler_healthcheck.main() == 1

    def test_stale_heartbeat_is_unhealthy(self, path: Path) -> None:
        path.touch()
        old = time.time() - HEARTBEAT_MAX_AGE_SECONDS - 1
        os.utime(path, (old, old))
        assert scheduler_healthcheck.main() == 1

    def test_max_age_tolerates_several_missed_beats(self) -> None:
        assert HEARTBEAT_MAX_AGE_SECONDS >= HEARTBEAT_INTERVAL_SECONDS * 3
