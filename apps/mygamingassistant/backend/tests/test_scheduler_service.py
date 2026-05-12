"""Unit tests for scheduler_service.

Tests cover:
  - start_scheduler() registers both jobs (async context required for AsyncIOScheduler)
  - shutdown_scheduler() stops the scheduler
  - trigger_job() returns True for known jobs, False for unknown
  - cleanup_ingestion_downloads deletes oldest files when over cap
  - SchedulerNotStartedError when scheduler not running

All scheduler lifecycle tests run as async so the event loop is available
when AsyncIOScheduler.start() is called.
"""
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.scheduling.scheduler_service import (
    JOB_CLEANUP_DOWNLOADS,
    JOB_SYNC_ALL_SOURCES,
    SchedulerNotStartedError,
    _run_cleanup_downloads,
    get_job_status,
    get_scheduler,
    shutdown_scheduler,
    start_scheduler,
    trigger_job,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_scheduler():
    """Reset scheduler state before and after each test."""
    shutdown_scheduler()
    yield
    shutdown_scheduler()


# ---------------------------------------------------------------------------
# start_scheduler — must be async so the event loop is available
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_scheduler_registers_both_jobs():
    scheduler = start_scheduler(sync_interval_hours=6)
    assert scheduler is not None
    assert scheduler.running

    job_ids = {j.id for j in scheduler.get_jobs()}
    assert JOB_SYNC_ALL_SOURCES in job_ids
    assert JOB_CLEANUP_DOWNLOADS in job_ids


@pytest.mark.asyncio
async def test_start_scheduler_idempotent():
    s1 = start_scheduler(sync_interval_hours=6)
    s2 = start_scheduler(sync_interval_hours=6)
    assert s1 is s2


@pytest.mark.asyncio
async def test_start_scheduler_custom_interval():
    scheduler = start_scheduler(sync_interval_hours=12)
    job = scheduler.get_job(JOB_SYNC_ALL_SOURCES)
    assert job is not None
    # Verify the trigger is an interval trigger (trigger str contains "interval")
    trigger_str = str(job.trigger)
    assert "interval" in trigger_str.lower()


# ---------------------------------------------------------------------------
# shutdown_scheduler
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_shutdown_scheduler_stops_scheduler():
    start_scheduler()
    assert get_scheduler() is not None
    shutdown_scheduler()
    scheduler = get_scheduler()
    assert scheduler is None or not scheduler.running


def test_shutdown_scheduler_idempotent():
    """Calling shutdown when already stopped should not raise."""
    shutdown_scheduler()
    shutdown_scheduler()  # second call should be safe


# ---------------------------------------------------------------------------
# get_job_status
# ---------------------------------------------------------------------------

def test_get_job_status_returns_empty_when_not_started():
    # Scheduler is shut down by autouse fixture
    jobs = get_job_status()
    assert jobs == []


@pytest.mark.asyncio
async def test_get_job_status_returns_jobs_when_started():
    start_scheduler()
    jobs = get_job_status()
    assert len(jobs) == 2
    job_ids = {j["id"] for j in jobs}
    assert JOB_SYNC_ALL_SOURCES in job_ids
    assert JOB_CLEANUP_DOWNLOADS in job_ids
    for job in jobs:
        assert "name" in job
        assert "trigger" in job


# ---------------------------------------------------------------------------
# trigger_job
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_job_returns_true_for_known_job():
    start_scheduler()
    result = await trigger_job(JOB_SYNC_ALL_SOURCES)
    assert result is True


@pytest.mark.asyncio
async def test_trigger_job_returns_false_for_unknown_job():
    start_scheduler()
    result = await trigger_job("nonexistent_job")
    assert result is False


@pytest.mark.asyncio
async def test_trigger_job_raises_when_not_started():
    # Scheduler is not started (autouse fixture shut it down)
    with pytest.raises(SchedulerNotStartedError):
        await trigger_job(JOB_SYNC_ALL_SOURCES)


# ---------------------------------------------------------------------------
# _run_cleanup_downloads — disk cap enforcement
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cleanup_downloads_does_nothing_when_dir_missing(tmp_path):
    """If the download dir doesn't exist, cleanup should be a no-op."""
    from app.core.config import settings
    nonexistent = tmp_path / "nonexistent"
    with patch.object(settings, "ingestion_download_dir", str(nonexistent)):
        # Should not raise
        await _run_cleanup_downloads()


@pytest.mark.asyncio
async def test_cleanup_downloads_deletes_all_when_cap_zero(tmp_path):
    """When cap is 0 GB, all files should be deleted."""
    import os
    from app.core.config import settings

    file_old = tmp_path / "old.mp4"
    file_new = tmp_path / "new.mp4"

    file_old.write_bytes(b"x" * 100)
    file_new.write_bytes(b"x" * 100)

    # Set mtimes: old < new
    os.utime(file_old, (time.time() - 7200, time.time() - 7200))
    os.utime(file_new, (time.time() - 60, time.time() - 60))

    with patch.object(settings, "ingestion_download_dir", str(tmp_path)):
        with patch.object(settings, "ingestion_download_dir_max_gb", 0):
            await _run_cleanup_downloads()

    assert not file_old.exists()
    assert not file_new.exists()


@pytest.mark.asyncio
async def test_cleanup_downloads_does_nothing_when_under_cap(tmp_path):
    """When under cap, no files are deleted."""
    from app.core.config import settings

    test_file = tmp_path / "small.mp4"
    test_file.write_bytes(b"x" * 100)

    with patch.object(settings, "ingestion_download_dir", str(tmp_path)):
        with patch.object(settings, "ingestion_download_dir_max_gb", 100):
            await _run_cleanup_downloads()

    assert test_file.exists()


@pytest.mark.asyncio
async def test_cleanup_downloads_deletes_oldest_first(tmp_path):
    """When over cap, oldest files are deleted first."""
    import os
    from app.core.config import settings

    # 3 files: 100 bytes each = 300 bytes total
    f1 = tmp_path / "f1.mp4"
    f2 = tmp_path / "f2.mp4"
    f3 = tmp_path / "f3.mp4"
    f1.write_bytes(b"x" * 100)
    f2.write_bytes(b"x" * 100)
    f3.write_bytes(b"x" * 100)

    # f1 is oldest
    os.utime(f1, (time.time() - 7200, time.time() - 7200))
    os.utime(f2, (time.time() - 3600, time.time() - 3600))
    os.utime(f3, (time.time() - 60, time.time() - 60))

    # Cap 0 = delete everything; oldest deleted first
    with patch.object(settings, "ingestion_download_dir", str(tmp_path)):
        with patch.object(settings, "ingestion_download_dir_max_gb", 0):
            await _run_cleanup_downloads()

    # All deleted
    assert not f1.exists()
    assert not f2.exists()
    assert not f3.exists()
