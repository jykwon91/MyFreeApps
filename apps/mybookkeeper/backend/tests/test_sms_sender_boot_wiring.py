"""Both processes that can send rent reminder texts refuse to boot when Twilio
is sending and no SMS_SENDER_USER_ID is set: the API (Send now) and the
scheduler worker (the scheduled tick)."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app import main
from app.core.config import settings
from app.core.sms_sender_not_configured_error import SmsSenderNotConfiguredError
from app.workers import scheduler_worker


@pytest.fixture
def twilio_without_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "environment", "test")
    monkeypatch.setattr(settings, "transparency_primary", False)
    monkeypatch.setattr(settings, "run_upload_worker", False)
    monkeypatch.setattr(settings, "sms_backend", "twilio")
    monkeypatch.setattr(settings, "sms_sender_user_id", "")


@pytest.mark.usefixtures("twilio_without_sender")
async def test_the_api_refuses_to_boot() -> None:
    with pytest.raises(SmsSenderNotConfiguredError, match="SMS_SENDER_USER_ID"):
        await main._on_startup()


@pytest.mark.usefixtures("twilio_without_sender")
async def test_the_scheduler_worker_refuses_to_boot(tmp_path) -> None:
    worker = "app.workers.scheduler_worker"
    with (
        patch(f"{worker}.HEARTBEAT_PATH", tmp_path / "hb"),
        patch(f"{worker}.init_sentry", MagicMock()),
        patch(f"{worker}.engine", MagicMock(dispose=AsyncMock())),
        pytest.raises(SmsSenderNotConfiguredError, match="SMS_SENDER_USER_ID"),
    ):
        await asyncio.wait_for(scheduler_worker.run_scheduler(asyncio.Event()), timeout=5)
