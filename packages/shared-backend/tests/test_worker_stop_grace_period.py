"""Render-time validation + rendering of an app.yaml worker ``stop_grace_period``."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from platform_shared.infra.worker_stop_grace_period import validate_worker_stop_grace_period

_REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize("value", ["60s", "2m", "1500ms", "1h"])
def test_durations_are_accepted(value: str) -> None:
    assert validate_worker_stop_grace_period("w", value) == value


@pytest.mark.parametrize("value", [60, "60", "1m30s", "sixty", "", None, True, ["60s"]])
def test_malformed_values_are_rejected(value: object) -> None:
    with pytest.raises(ValueError, match="stop_grace_period"):
        validate_worker_stop_grace_period("w", value)


def test_declared_grace_period_reaches_the_compose_service() -> None:
    """MBK's scheduler declares one; workers without one keep compose's default."""
    app_yaml = yaml.safe_load((_REPO_ROOT / "apps/mybookkeeper/app.yaml").read_text(encoding="utf-8"))
    compose = yaml.safe_load(
        (_REPO_ROOT / "apps/mybookkeeper/docker-compose.yml").read_text(encoding="utf-8"),
    )
    for worker in app_yaml["workers"]:
        service = compose["services"][worker["name"]]
        assert service.get("stop_grace_period") == worker.get("stop_grace_period")
    assert compose["services"]["scheduler"]["stop_grace_period"] == "60s"
