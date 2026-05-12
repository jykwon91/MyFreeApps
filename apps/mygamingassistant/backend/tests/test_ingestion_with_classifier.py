"""Integration test — ingestion_orchestrator calls classifier after creating lineups.

Classifier is mocked. Verifies:
  - On classifier success, suggested FK fields are written to the Lineup row.
  - On classifier failure, the lineup row is still committed with status=pending_review.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.source import Source
from app.models.game.lineup import Lineup
from app.services.ingestion.chapter_parser import Chapter
from app.services.ingestion.youtube_fetcher import VideoMeta
from app.services.classification.classification_result import ClassificationResult

FAKE_VIDEO = VideoMeta(
    video_id="vid_cls_001",
    title="Classifier integration test",
    description="",
    duration=120,
    published_at="20260512",
    channel_name="TestCreator",
    url="https://www.youtube.com/watch?v=vid_cls_001",
    chapters=[
        {"start_time": 0, "end_time": 60, "title": "B-site smoke"},
    ],
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n"

_FAKE_GAME_ID = uuid.uuid4()
_FAKE_MAP_ID = uuid.uuid4()
_FAKE_ZONE_ID = uuid.uuid4()
_FAKE_UT_ID = uuid.uuid4()


@pytest_asyncio.fixture
async def source(db: AsyncSession) -> Source:
    src = Source(
        kind="youtube_channel",
        config_json={"url": "https://www.youtube.com/@TestCreator"},
    )
    db.add(src)
    await db.flush()
    return src


class TestIngestionWithClassifier:
    @pytest.mark.asyncio
    async def test_classifier_suggestions_written_on_success(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """After successful classification, suggested_* fields populated on the Lineup."""
        from app.services.ingestion import ingestion_orchestrator

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        successful_result = ClassificationResult(
            success=True,
            suggested_game_id=_FAKE_GAME_ID,
            suggested_map_id=_FAKE_MAP_ID,
            suggested_target_zone_id=_FAKE_ZONE_ID,
            suggested_stand_zone_id=None,
            suggested_side="side_a",
            suggested_utility_type_id=_FAKE_UT_ID,
            aim_anchor_x=0.5,
            aim_anchor_y=0.5,
            confidence=0.85,
            reasoning="Clear smoke throw",
            error_codes=[],
        )

        with (
            patch("app.services.ingestion.ingestion_orchestrator.list_videos", new_callable=AsyncMock, return_value=[FAKE_VIDEO]),
            patch("app.services.ingestion.ingestion_orchestrator.download_video", new_callable=AsyncMock, return_value=fake_video_path),
            patch("app.services.ingestion.ingestion_orchestrator.extract_frames", new_callable=AsyncMock, return_value=[_FAKE_PNG, _FAKE_PNG]),
            patch("app.services.ingestion.ingestion_orchestrator.get_storage") as mock_storage_factory,
            patch("app.services.ingestion.ingestion_orchestrator.classify_lineup", new_callable=AsyncMock, return_value=successful_result),
            patch.object(ingestion_orchestrator, "settings") as mock_settings,
        ):
            mock_settings.ingestion_download_dir = str(tmp_path)
            mock_settings.enable_classifier = True
            mock_storage = MagicMock()
            mock_storage.bucket = "test-bucket"
            mock_storage._client = MagicMock()
            mock_storage_factory.return_value = mock_storage

            await ingestion_orchestrator.sync_source(source.id, db)

        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
        )
        lineups = result.scalars().all()
        assert len(lineups) == 1
        lineup = lineups[0]
        assert lineup.status == "pending_review"
        # Classifier should have written suggested values
        assert lineup.suggested_game_id == _FAKE_GAME_ID
        assert lineup.suggested_side == "side_a"
        assert lineup.suggested_utility_type_id == _FAKE_UT_ID

    @pytest.mark.asyncio
    async def test_classifier_failure_does_not_abort(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """Classifier failure leaves lineup in pending_review without suggestions."""
        from app.services.ingestion import ingestion_orchestrator

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        failed_result = ClassificationResult(
            success=False,
            error_codes=["rate_limit_error"],
            reasoning="Rate limit hit",
        )

        with (
            patch("app.services.ingestion.ingestion_orchestrator.list_videos", new_callable=AsyncMock, return_value=[FAKE_VIDEO]),
            patch("app.services.ingestion.ingestion_orchestrator.download_video", new_callable=AsyncMock, return_value=fake_video_path),
            patch("app.services.ingestion.ingestion_orchestrator.extract_frames", new_callable=AsyncMock, return_value=[_FAKE_PNG, _FAKE_PNG]),
            patch("app.services.ingestion.ingestion_orchestrator.get_storage") as mock_storage_factory,
            patch("app.services.ingestion.ingestion_orchestrator.classify_lineup", new_callable=AsyncMock, return_value=failed_result),
            patch.object(ingestion_orchestrator, "settings") as mock_settings,
        ):
            mock_settings.ingestion_download_dir = str(tmp_path)
            mock_settings.enable_classifier = True
            mock_storage = MagicMock()
            mock_storage.bucket = "test-bucket"
            mock_storage._client = MagicMock()
            mock_storage_factory.return_value = mock_storage

            stats = await ingestion_orchestrator.sync_source(source.id, db)

        # Sync should still succeed despite classifier failure
        assert stats.chapter_count == 1
        assert stats.error_count == 0

        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
        )
        lineups = result.scalars().all()
        assert len(lineups) == 1
        lineup = lineups[0]
        assert lineup.status == "pending_review"
        # No suggestions written on failure
        assert lineup.suggested_game_id is None

    @pytest.mark.asyncio
    async def test_classifier_skipped_when_disabled(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """When enable_classifier=False, classify_lineup is never called."""
        from app.services.ingestion import ingestion_orchestrator

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        with (
            patch("app.services.ingestion.ingestion_orchestrator.list_videos", new_callable=AsyncMock, return_value=[FAKE_VIDEO]),
            patch("app.services.ingestion.ingestion_orchestrator.download_video", new_callable=AsyncMock, return_value=fake_video_path),
            patch("app.services.ingestion.ingestion_orchestrator.extract_frames", new_callable=AsyncMock, return_value=[_FAKE_PNG, _FAKE_PNG]),
            patch("app.services.ingestion.ingestion_orchestrator.get_storage") as mock_storage_factory,
            patch("app.services.ingestion.ingestion_orchestrator.classify_lineup", new_callable=AsyncMock) as mock_classify,
            patch.object(ingestion_orchestrator, "settings") as mock_settings,
        ):
            mock_settings.ingestion_download_dir = str(tmp_path)
            mock_settings.enable_classifier = False
            mock_storage = MagicMock()
            mock_storage.bucket = "test-bucket"
            mock_storage._client = MagicMock()
            mock_storage_factory.return_value = mock_storage

            await ingestion_orchestrator.sync_source(source.id, db)

        mock_classify.assert_not_called()
