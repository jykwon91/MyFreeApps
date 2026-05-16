"""Integration test — ingestion_orchestrator runs the Strategy A grid classifier.

The grid classifier (classify_frames_for_lineup_decision) is mocked. Verifies:
  - is_lineup=True → row created + suggested FK fields written via the repo.
  - Classifier call failure → chapter skipped, no row (Strategy A refuses to
    ingest frames it could not verify).
  - is_lineup=False → chapter skipped, no row created (the "stop junk" lever).
  - enable_classifier=False → classifier never called, chapter still kept.
"""
from __future__ import annotations

import contextlib
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.source import Source
from app.models.game.lineup import Lineup
from app.models.game.utility_type import UtilityType
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


@pytest_asyncio.fixture(autouse=True)
async def _seed_classifier_targets(db: AsyncSession) -> None:
    """Seed the Game/Map/Zone/UtilityType rows that the classifier mock points at.

    The mock writes suggested_game_id=_FAKE_GAME_ID etc. The lineup table has
    FK constraints to game/map/map_zone/utility_type on every suggested_*
    column, so without these rows the writeback fails with
    ForeignKeyViolationError.
    """
    game = Game(
        id=_FAKE_GAME_ID,
        slug="cls-test-game",
        name="Classifier Test Game",
        side_a_label="T",
        side_b_label="CT",
    )
    db.add(game)
    await db.flush()

    map_obj = Map(id=_FAKE_MAP_ID, game_id=game.id, slug="cls-test-map", name="Classifier Test Map")
    db.add(map_obj)
    await db.flush()

    zone = MapZone(id=_FAKE_ZONE_ID, map_id=map_obj.id, slug="cls-zone", name="Classifier Zone", polygon_points=[])
    db.add(zone)
    await db.flush()

    util = UtilityType(id=_FAKE_UT_ID, game_id=game.id, slug="cls-smoke", name="Classifier Smoke")
    db.add(util)
    await db.flush()


@contextlib.contextmanager
def _grid_env(tmp_path: Path, fake_video_path: Path, *, classify_mock):
    """Enter the common ingestion patches for a grid-classifier test.

    `classify_mock` is the mock to install for
    classify_frames_for_lineup_decision (an AsyncMock). Yields
    (mock_settings, mock_storage) for the test to configure further.

    A parenthesized `with (...)` cannot mix ``*tuple`` unpacking with ``as``
    bindings, so the shared patch set is entered via an ExitStack here.
    """
    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.list_videos", new_callable=AsyncMock, return_value=[FAKE_VIDEO]))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.fetch_video_detail", new_callable=AsyncMock, return_value=FAKE_VIDEO))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.download_video", new_callable=AsyncMock, return_value=fake_video_path))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.extract_frames", new_callable=AsyncMock, return_value=[_FAKE_PNG] * 5))
        mock_storage_factory = stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.get_storage"))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.classify_frames_for_lineup_decision", new=classify_mock))
        mock_settings = stack.enter_context(patch.object(ingestion_orchestrator_module(), "settings"))

        mock_settings.ingestion_download_dir = str(tmp_path)
        mock_storage = MagicMock()
        mock_storage.bucket = "test-bucket"
        mock_storage._client = MagicMock()
        mock_storage_factory.return_value = mock_storage
        yield mock_settings, mock_storage


def ingestion_orchestrator_module():
    from app.services.ingestion import ingestion_orchestrator
    return ingestion_orchestrator


class TestIngestionWithClassifier:
    @pytest.mark.asyncio
    async def test_lineup_created_and_suggestions_written_when_is_lineup(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """is_lineup=True → row created and suggested_* written via the repo."""
        ingestion_orchestrator = ingestion_orchestrator_module()

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        # Strategy A: classify_frames_for_lineup_decision does NOT touch the
        # DB (no row exists yet). It just returns the verdict + suggestions;
        # the orchestrator creates the row and writes the suggestions via the
        # repo. So a plain return_value mock is correct here (unlike the old
        # single-image path which needed a writeback side effect).
        grid_result = ClassificationResult(
            success=True,
            is_lineup=True,
            best_stand_index=2,
            best_aim_index=4,
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
        classify_mock = AsyncMock(return_value=grid_result)

        with _grid_env(tmp_path, fake_video_path, classify_mock=classify_mock) as (
            mock_settings,
            _mock_storage,
        ):
            mock_settings.enable_classifier = True
            await ingestion_orchestrator.sync_source(source.id, db)

        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
        )
        lineups = result.scalars().all()
        assert len(lineups) == 1
        lineup = lineups[0]
        assert lineup.status == "pending_review"
        # Orchestrator wrote the classifier suggestions through the repo.
        assert lineup.suggested_game_id == _FAKE_GAME_ID
        assert lineup.suggested_side == "side_a"
        assert lineup.suggested_utility_type_id == _FAKE_UT_ID
        assert lineup.classification_confidence == pytest.approx(0.85)

    @pytest.mark.asyncio
    async def test_classifier_call_failure_skips_chapter(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """A failed classifier *call* skips the chapter — Strategy A refuses
        to ingest a chapter it could not verify (no unjudged junk rows)."""
        ingestion_orchestrator = ingestion_orchestrator_module()

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        failed_result = ClassificationResult(
            success=False,
            error_codes=["rate_limit_error"],
            reasoning="Rate limit hit",
        )
        classify_mock = AsyncMock(return_value=failed_result)

        with _grid_env(tmp_path, fake_video_path, classify_mock=classify_mock) as (
            mock_settings,
            _mock_storage,
        ):
            mock_settings.enable_classifier = True
            stats = await ingestion_orchestrator.sync_source(source.id, db)

        # Chapter skipped (handled, not an error) and NO row created.
        assert stats.chapter_count == 1
        assert stats.error_count == 0

        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
        )
        assert result.scalars().all() == []

    @pytest.mark.asyncio
    async def test_not_a_lineup_skips_chapter_no_row(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """is_lineup=False → chapter skipped, no pending row (the junk lever)."""
        ingestion_orchestrator = ingestion_orchestrator_module()

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        not_lineup = ClassificationResult(
            success=True,
            is_lineup=False,
            confidence=0.02,
            reasoning="Webcam talking-head, not a lineup.",
            error_codes=[],
        )
        classify_mock = AsyncMock(return_value=not_lineup)

        with _grid_env(tmp_path, fake_video_path, classify_mock=classify_mock) as (
            mock_settings,
            mock_storage,
        ):
            mock_settings.enable_classifier = True
            stats = await ingestion_orchestrator.sync_source(source.id, db)

        # Handled (not an error) but NO row — this is the "stop junk" behaviour.
        assert stats.chapter_count == 1
        assert stats.error_count == 0

        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
        )
        assert result.scalars().all() == []
        # MinIO must NOT have been written for a skipped chapter.
        mock_storage._client.put_object.assert_not_called()

    @pytest.mark.asyncio
    async def test_classifier_skipped_when_disabled(
        self,
        db: AsyncSession,
        source: Source,
        tmp_path: Path,
    ):
        """enable_classifier=False → grid classifier never called, row kept."""
        ingestion_orchestrator = ingestion_orchestrator_module()

        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        classify_mock = AsyncMock()

        with _grid_env(tmp_path, fake_video_path, classify_mock=classify_mock) as (
            mock_settings,
            _mock_storage,
        ):
            mock_settings.enable_classifier = False
            stats = await ingestion_orchestrator.sync_source(source.id, db)

        classify_mock.assert_not_called()
        # Classifier disabled → Strategy A still keeps the chapter (first/last
        # grid frame), so the row is created with no suggestions.
        assert stats.chapter_count == 1
        result = await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
        )
        lineups = result.scalars().all()
        assert len(lineups) == 1
        assert lineups[0].suggested_game_id is None
