"""Boot wiring: the scheduler always starts; each job group follows its switch.

Serve-only prod runs SCHEDULER_ENABLED=false (no YouTube re-sync) and still
needs the WoW price refresh (or GET /wow/prices stays empty) and the
feature-request retention purge.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app import main
from app.core.config import settings

_START = "app.services.scheduling.scheduler_service.start_scheduler"


@pytest.mark.parametrize(
    ("scheduler_enabled", "price_enabled", "status_enabled"),
    [(False, False, False), (False, True, True), (True, False, True), (True, True, False)],
)
def test_starts_the_enabled_job_groups(
    monkeypatch: pytest.MonkeyPatch, scheduler_enabled: bool, price_enabled: bool, status_enabled: bool,
) -> None:
    monkeypatch.setattr(settings, "scheduler_enabled", scheduler_enabled)
    monkeypatch.setattr(settings, "wow_price_refresh_enabled", price_enabled)
    monkeypatch.setattr(settings, "wow_server_status_recording_enabled", status_enabled)
    with patch(_START) as start:
        main._start_scheduler()
    start.assert_called_once()
    assert start.call_args.kwargs["source_jobs"] is scheduler_enabled
    assert start.call_args.kwargs["price_refresh"] is price_enabled
    assert start.call_args.kwargs["server_status_recording"] is status_enabled


def test_production_fails_loud_when_the_scheduler_cannot_start(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "scheduler_enabled", False)
    monkeypatch.setattr(settings, "wow_price_refresh_enabled", True)
    monkeypatch.setattr(settings, "environment", "production")
    with patch(_START, MagicMock(side_effect=RuntimeError("boom"))):
        with pytest.raises(main.SchedulerStartupError):
            main._start_scheduler()
