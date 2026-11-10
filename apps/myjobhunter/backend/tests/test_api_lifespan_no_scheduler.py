"""The API process must never start the discovery scheduler.

It runs ``uvicorn --workers 2`` and every worker runs the lifespan, so a
scheduler started there fires each job once per worker. The scheduler runs
in its own service (app.workers.discovery_scheduler_worker).
"""
from __future__ import annotations

import pytest
from apscheduler.schedulers.base import BaseScheduler

from app import main
from app.services.discovery import discovery_embedding_service, discovery_scheduler_service


@pytest.mark.asyncio
async def test_api_startup_does_not_start_a_scheduler(monkeypatch: pytest.MonkeyPatch, db):
    started: list[BaseScheduler] = []

    def _record_start(self: BaseScheduler, paused: bool = False) -> None:
        started.append(self)

    monkeypatch.setattr(BaseScheduler, "start", _record_start)
    monkeypatch.setattr(discovery_embedding_service, "load_model_eager", lambda: None)

    await main._on_startup()

    assert started == []
    assert discovery_scheduler_service._scheduler is None
