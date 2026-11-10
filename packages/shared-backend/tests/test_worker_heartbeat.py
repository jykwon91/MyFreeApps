"""platform_shared.workers.heartbeat + heartbeat_healthcheck."""
from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from platform_shared.workers.heartbeat import clear_heartbeat, heartbeat_age_seconds, touch_heartbeat
from platform_shared.workers.heartbeat_healthcheck import check_heartbeat


def test_age_is_none_until_touched_and_after_clear(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    assert heartbeat_age_seconds(path) is None
    touch_heartbeat(path)
    age = heartbeat_age_seconds(path)
    assert age is not None
    assert 0 <= age < 5
    clear_heartbeat(path)
    assert heartbeat_age_seconds(path) is None
    clear_heartbeat(path)  # idempotent


def test_touch_advances_the_age(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    touch_heartbeat(path)
    os.utime(path, (time.time() - 100, time.time() - 100))
    assert heartbeat_age_seconds(path) == pytest.approx(100, abs=5)
    touch_heartbeat(path)
    age = heartbeat_age_seconds(path)
    assert age is not None
    assert age < 5


def test_healthcheck_without_a_heartbeat(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert check_heartbeat(tmp_path / "hb", 45) == 1
    assert "unhealthy: no heartbeat" in capsys.readouterr().out


def test_healthcheck_with_a_fresh_heartbeat(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "hb"
    touch_heartbeat(path)
    assert check_heartbeat(path, 45) == 0
    assert capsys.readouterr().out.startswith("healthy:")


def test_healthcheck_with_a_stale_heartbeat(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "hb"
    touch_heartbeat(path)
    os.utime(path, (time.time() - 60, time.time() - 60))
    assert check_heartbeat(path, 45) == 1
    assert "(max 45s)" in capsys.readouterr().out
