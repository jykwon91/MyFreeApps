"""Every app's API healthcheck gives startup a grace period.

`docker compose up -d` waits for the api to be healthy before starting caddy.
Without ``start_period``, Docker marks the api unhealthy after ``retries`` x
``interval`` (~30s), so a slow-but-fine startup aborts the deploy and leaves
caddy stopped: the site serves 502 while the api is healthy (MyBookkeeper,
2026-11-24: startup took 33s).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml
from platform_shared.infra import render as _render

_REPO_ROOT = Path(__file__).resolve().parents[3]
_APPS = _render._list_apps(_REPO_ROOT)
_DURATION = re.compile(r"^(\d+)s$")


def _seconds(value: str) -> int:
    match = _DURATION.match(value)
    assert match, f"expected a duration in seconds like '60s', got {value!r}"
    return int(match.group(1))


@pytest.mark.parametrize("app", _APPS)
def test_api_healthcheck_outlasts_slow_startup(app: str) -> None:
    compose = yaml.safe_load((_REPO_ROOT / "apps" / app / "docker-compose.yml").read_text(encoding="utf-8"))
    healthcheck = compose["services"]["api"]["healthcheck"]
    assert "start_period" in healthcheck, (
        f"apps/{app}: the api healthcheck needs a start_period, or a slow startup "
        "aborts the deploy before caddy starts (site 502s)."
    )
    budget = _seconds(healthcheck["start_period"]) + _seconds(healthcheck["interval"]) * healthcheck["retries"]
    assert budget >= 60, f"apps/{app}: the api gets only {budget}s to become healthy; allow at least 60s."
