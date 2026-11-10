"""The API never starts APScheduler.

It runs ``uvicorn --workers 2`` and every worker runs ``_on_startup``, so a
scheduler started there ran every job once per worker. The scheduler runs
only in the ``scheduler`` service (test_scheduler_worker.py).
"""
from __future__ import annotations

import inspect

import pytest
from apscheduler.schedulers.base import BaseScheduler

from app import main
from app.services.scheduling import scheduler_service


@pytest.mark.asyncio
async def test_api_startup_does_not_start_a_scheduler(monkeypatch: pytest.MonkeyPatch, db) -> None:
    started: list[BaseScheduler] = []

    def _record_start(self: BaseScheduler, paused: bool = False) -> None:
        started.append(self)

    monkeypatch.setattr(BaseScheduler, "start", _record_start)

    await main._on_startup()

    assert started == []
    assert scheduler_service._scheduler is None


def test_main_has_no_scheduler_wiring() -> None:
    source = inspect.getsource(main)
    assert "scheduler_service" not in source
    assert "start_scheduler" not in source
