"""platform_shared.workers.heartbeat_beater + wait_or_stop."""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
from pathlib import Path

import pytest

from platform_shared.workers.heartbeat_beater import keep_heartbeat_fresh
from platform_shared.workers.wait_or_stop import wait_or_stop

_STALE = 1.0


def _mark_stale(path: Path) -> None:
    os.utime(path, (_STALE, _STALE))


async def test_touches_on_entry(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    async with keep_heartbeat_fresh(path, interval_seconds=60):
        assert path.exists()


async def test_keeps_touching_while_the_block_is_busy(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    async with keep_heartbeat_fresh(path, interval_seconds=0.01):
        _mark_stale(path)
        await asyncio.sleep(0.2)
        assert path.stat().st_mtime > _STALE


async def test_stops_touching_once_the_block_exits(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    async with keep_heartbeat_fresh(path, interval_seconds=0.01):
        pass
    _mark_stale(path)
    await asyncio.sleep(0.1)
    assert path.stat().st_mtime == _STALE


async def test_stops_touching_when_the_block_raises(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    with pytest.raises(RuntimeError, match="worker died"):
        async with keep_heartbeat_fresh(path, interval_seconds=0.01):
            raise RuntimeError("worker died")
    _mark_stale(path)
    await asyncio.sleep(0.1)
    assert path.stat().st_mtime == _STALE


async def test_unwritable_path_fails_on_entry(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        async with keep_heartbeat_fresh(tmp_path / "missing-dir" / "hb", interval_seconds=60):
            pass


async def test_wait_or_stop_waits_out_the_timeout() -> None:
    started = time.monotonic()
    await wait_or_stop(asyncio.Event(), 0.05)
    assert time.monotonic() - started >= 0.04


async def test_wait_or_stop_returns_as_soon_as_stop_is_set() -> None:
    stop = asyncio.Event()
    asyncio.get_running_loop().call_later(0.01, stop.set)
    started = time.monotonic()
    await wait_or_stop(stop, 30)
    assert time.monotonic() - started < 5


async def test_a_dying_writer_is_logged_at_error(
    tmp_path: Path, caplog: pytest.LogCaptureFixture,
) -> None:
    beat_dir = tmp_path / "beat"
    beat_dir.mkdir()
    path = beat_dir / "hb"
    with caplog.at_level(logging.ERROR, logger="platform_shared.workers.heartbeat_beater"):
        async with keep_heartbeat_fresh(path, interval_seconds=0.01):
            shutil.rmtree(beat_dir)  # the next touch raises FileNotFoundError
            await asyncio.sleep(0.1)
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "heartbeat writer stopped" in errors[0].getMessage()
    assert errors[0].exc_info is not None
    assert errors[0].exc_info[0] is FileNotFoundError


async def test_a_normal_exit_logs_nothing(
    tmp_path: Path, caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.ERROR, logger="platform_shared.workers.heartbeat_beater"):
        async with keep_heartbeat_fresh(tmp_path / "hb", interval_seconds=0.01):
            await asyncio.sleep(0.05)
    assert caplog.records == []
