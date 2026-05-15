"""Integration tests for ingestion_orchestrator.sync_source.

All external dependencies (yt-dlp, ffmpeg, MinIO) are mocked.
Tests verify that Lineup rows are created with the correct shape.
"""
from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.source import Source
from app.models.game.lineup import Lineup
from app.services.ingestion.chapter_parser import Chapter
from app.services.ingestion.youtube_fetcher import VideoMeta


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def source(db: AsyncSession) -> Source:
    src = Source(
        id=uuid.uuid4(),
        kind="youtube_playlist",
        config_json={"url": "https://www.youtube.com/playlist?list=PLtest"},
    )
    db.add(src)
    await db.flush()
    return src


FAKE_VIDEO = VideoMeta(
    video_id="vid001",
    title="Valorant smokes",
    description="",
    duration=300,
    published_at="20260101",
    channel_name="TestCreator",
    url="https://www.youtube.com/watch?v=vid001",
    chapters=[
        {"start_time": 0, "end_time": 90, "title": "A-site from CT"},
        {"start_time": 90, "end_time": 200, "title": "B-site default"},
    ],
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSyncSource:
    @pytest.mark.asyncio
    async def test_creates_lineup_rows_for_chapters(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        from app.services.ingestion import ingestion_orchestrator
        from sqlalchemy import select

        fake_video_path = tmp_path / "vid001.mp4"
        fake_video_path.write_bytes(b"fake video")

        with (
            patch(
                "app.services.ingestion.ingestion_orchestrator.list_videos",
                new_callable=AsyncMock,
                return_value=[FAKE_VIDEO],
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.download_video",
                new_callable=AsyncMock,
                return_value=fake_video_path,
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.extract_frames",
                new_callable=AsyncMock,
                return_value=[_FAKE_PNG, _FAKE_PNG],
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.get_storage",
            ) as mock_storage_factory,
            patch.object(
                ingestion_orchestrator,
                "settings",
            ) as mock_settings,
        ):
            mock_settings.ingestion_download_dir = str(tmp_path)
            mock_storage = MagicMock()
            mock_storage.bucket = "mygamingassistant-screenshots"
            mock_storage._client = MagicMock()
            mock_storage_factory.return_value = mock_storage

            stats = await ingestion_orchestrator.sync_source(source.id, db)

        assert stats.video_count == 1
        assert stats.chapter_count == 2
        assert stats.error_count == 0

        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid001")
        )
        lineups = result.scalars().all()
        assert len(lineups) == 2

        # All lineups should be pending_review with correct metadata.
        for lineup in lineups:
            assert lineup.status == "pending_review"
            assert lineup.youtube_video_id == "vid001"
            assert lineup.source_id == source.id
            assert lineup.attribution_author == "TestCreator"
            # Classification fields null until classifier runs (PR 5).
            assert lineup.target_zone_id is None
            assert lineup.stand_zone_id is None
            assert lineup.utility_type_id is None
            assert lineup.side is None

    @pytest.mark.asyncio
    async def test_dedup_skips_existing_video(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """Videos already in the lineup table should not be re-processed."""
        from app.services.ingestion import ingestion_orchestrator
        from sqlalchemy import select

        # Pre-insert a lineup with the same video_id.
        existing = Lineup(
            youtube_video_id="vid001",
            title="Already processed",
            source_id=source.id,
            status="pending_review",
            game_id=None,
            map_id=None,
        )
        db.add(existing)
        await db.flush()

        with (
            patch(
                "app.services.ingestion.ingestion_orchestrator.list_videos",
                new_callable=AsyncMock,
                return_value=[FAKE_VIDEO],
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.download_video",
                new_callable=AsyncMock,
            ) as mock_download,
            patch.object(
                ingestion_orchestrator,
                "settings",
            ) as mock_settings,
        ):
            mock_settings.ingestion_download_dir = str(tmp_path)
            stats = await ingestion_orchestrator.sync_source(source.id, db)

        # Download should not have been called for the duplicate video.
        mock_download.assert_not_called()
        assert stats.video_count == 0

    @pytest.mark.asyncio
    async def test_chapter_error_is_skipped_not_fatal(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """A frame extraction failure on one chapter should not abort the whole sync."""
        from app.services.ingestion import ingestion_orchestrator
        from app.services.ingestion.frame_extractor import FrameExtractionError

        fake_video_path = tmp_path / "vid001.mp4"
        fake_video_path.write_bytes(b"fake")

        # First chapter fails, second succeeds.
        frame_results = iter([
            FrameExtractionError(
                "ffmpeg failed", timestamp=0.0, returncode=1, stderr="error"
            ),
            (_FAKE_PNG, _FAKE_PNG),  # won't reach here due to raise
        ])

        async def _mock_extract(video_path, timestamps):
            val = next(frame_results)
            if isinstance(val, FrameExtractionError):
                raise val
            return list(val)

        with (
            patch(
                "app.services.ingestion.ingestion_orchestrator.list_videos",
                new_callable=AsyncMock,
                return_value=[FAKE_VIDEO],
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.download_video",
                new_callable=AsyncMock,
                return_value=fake_video_path,
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.extract_frames",
                side_effect=_mock_extract,
            ),
            patch(
                "app.services.ingestion.ingestion_orchestrator.get_storage",
            ) as mock_storage_factory,
            patch.object(
                ingestion_orchestrator,
                "settings",
            ) as mock_settings,
        ):
            mock_settings.ingestion_download_dir = str(tmp_path)
            mock_storage = MagicMock()
            mock_storage.bucket = "mygamingassistant-screenshots"
            mock_storage._client = MagicMock()
            mock_storage_factory.return_value = mock_storage

            stats = await ingestion_orchestrator.sync_source(source.id, db)

        # One chapter errored; the other succeeded.
        assert stats.chapter_count == 1
        assert stats.error_count == 1
        assert stats.video_count == 1
