"""The scheduler's job bodies (``scheduled_jobs``).

- every body logs its own failure and never raises (a raise would only be
  logged by APScheduler, but the job must keep its schedule either way)
- sync_all_sources skips deleted sources and keeps going past a failure
- cleanup_ingestion_downloads enforces the download-dir cap, oldest first
"""
from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.services.scheduling import scheduled_jobs


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("body", "target", "attr"),
    [
        ("run_refresh_wow_prices", scheduled_jobs.price_refresh_service, "refresh_all"),
        ("run_record_server_status", scheduled_jobs.server_status_history_service, "record_all"),
        ("run_purge_server_status_history", scheduled_jobs.server_status_history_service, "purge_old"),
        ("run_purge_character_metrics", scheduled_jobs.character_store_service, "purge_old_metrics"),
        ("run_purge_feature_submissions", scheduled_jobs.feature_retention_service, "purge_feature_request_data"),
        ("run_raid_notifications", scheduled_jobs.raid_notification_worker, "process_due_notifications"),
    ],
)
async def test_a_failing_job_is_logged_not_raised(
    body: str, target: object, attr: str, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    failing = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr(target, attr, failing)
    await getattr(scheduled_jobs, body)()
    failing.assert_awaited_once()
    assert "run failed" in caplog.text


@dataclass
class _Source:
    id: uuid.UUID
    kind: str
    config_json: dict[str, bool] | None


@dataclass
class _Stats:
    video_count: int = 1
    chapter_count: int = 2
    error_count: int = 0


class _NoSession:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *exc: object) -> None:
        return None


@pytest.mark.asyncio
async def test_sync_all_sources_skips_deleted_and_survives_a_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    active, deleted, broken, unconfigured = (uuid.uuid4() for _ in range(4))
    sources = [
        _Source(active, "youtube_channel", {"deleted": False}),
        _Source(deleted, "youtube_channel", {"deleted": True}),
        _Source(broken, "youtube_channel", {}),
        _Source(unconfigured, "youtube_channel", None),
    ]
    synced: list[uuid.UUID] = []

    async def _sync(source_id: uuid.UUID, db: None) -> _Stats:
        synced.append(source_id)
        if source_id == broken:
            raise RuntimeError("yt-dlp failed")
        return _Stats()

    monkeypatch.setattr(scheduled_jobs, "AsyncSessionLocal", _NoSession)
    monkeypatch.setattr(scheduled_jobs, "list_sources", AsyncMock(return_value=sources))
    monkeypatch.setattr(scheduled_jobs.ingestion_orchestrator, "sync_source", _sync)

    await scheduled_jobs.run_sync_all_sources()
    assert synced == [active, broken, unconfigured]


# ---------------------------------------------------------------------------
# cleanup_ingestion_downloads
# ---------------------------------------------------------------------------

def _aged_file(path: Path, age_seconds: float) -> Path:
    path.write_bytes(b"x" * 100)
    stamp = time.time() - age_seconds
    os.utime(path, (stamp, stamp))
    return path


@pytest.mark.asyncio
async def test_cleanup_is_a_no_op_without_the_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingestion_download_dir", str(tmp_path / "missing"))
    await scheduled_jobs.run_cleanup_downloads()


@pytest.mark.asyncio
async def test_cleanup_keeps_files_under_the_cap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    kept = _aged_file(tmp_path / "small.mp4", 60)
    monkeypatch.setattr(settings, "ingestion_download_dir", str(tmp_path))
    monkeypatch.setattr(settings, "ingestion_download_dir_max_gb", 100)
    await scheduled_jobs.run_cleanup_downloads()
    assert kept.exists()


@pytest.mark.asyncio
async def test_cleanup_deletes_oldest_first_until_under_the_cap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    oldest = _aged_file(tmp_path / "f1.mp4", 7200)
    middle = _aged_file(tmp_path / "f2.mp4", 3600)
    newest = _aged_file(tmp_path / "f3.mp4", 60)
    monkeypatch.setattr(settings, "ingestion_download_dir", str(tmp_path))
    # A cap of 150 bytes: deleting the two oldest files brings 300 bytes under it.
    monkeypatch.setattr(settings, "ingestion_download_dir_max_gb", 150 / 1024**3)
    await scheduled_jobs.run_cleanup_downloads()
    assert not oldest.exists()
    assert not middle.exists()
    assert newest.exists()


@pytest.mark.asyncio
async def test_cleanup_with_a_zero_cap_deletes_everything(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    files = [_aged_file(tmp_path / f"f{i}.mp4", 60 * i) for i in range(1, 4)]
    monkeypatch.setattr(settings, "ingestion_download_dir", str(tmp_path))
    monkeypatch.setattr(settings, "ingestion_download_dir_max_gb", 0)
    await scheduled_jobs.run_cleanup_downloads()
    assert not any(f.exists() for f in files)
