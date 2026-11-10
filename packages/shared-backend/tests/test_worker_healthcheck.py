"""Render-time validation of app.yaml worker healthchecks."""
from __future__ import annotations

import pytest

from platform_shared.infra.worker_healthcheck import normalize_worker_healthcheck

_TEST = ["CMD", "python", "-m", "app.workers.x_healthcheck"]


def test_minimal_healthcheck_gets_defaults() -> None:
    assert normalize_worker_healthcheck("w", {"test": _TEST}) == {
        "test": _TEST,
        "interval": "15s",
        "timeout": "5s",
        "start_period": "60s",
        "retries": 3,
    }


def test_explicit_timings_are_kept() -> None:
    hc = normalize_worker_healthcheck(
        "w",
        {"test": ["CMD-SHELL", "test -f /tmp/ok"], "interval": "30s",
         "timeout": "2s", "start_period": "2m", "retries": 5},
    )
    assert (hc["interval"], hc["timeout"], hc["start_period"], hc["retries"]) == (
        "30s", "2s", "2m", 5,
    )


@pytest.mark.parametrize(
    "raw",
    [
        _TEST,  # bare list (old shape) — must be a mapping
        {},
        {"test": ["python", "-m", "x"]},  # missing CMD / CMD-SHELL
        {"test": ["CMD"]},  # no command
        {"test": ["CMD", ""]},
        {"test": "CMD python -m x"},
        {"test": _TEST, "interval": 15},
        {"test": _TEST, "timeout": "five"},
        {"test": _TEST, "retries": 0},
        {"test": _TEST, "retries": True},
        {"test": _TEST, "retries": "3"},
        {"test": _TEST, "start_perod": "60s"},  # typo'd key
    ],
)
def test_malformed_healthcheck_is_rejected(raw: object) -> None:
    with pytest.raises(ValueError, match="worker 'w' healthcheck"):
        normalize_worker_healthcheck("w", raw)
