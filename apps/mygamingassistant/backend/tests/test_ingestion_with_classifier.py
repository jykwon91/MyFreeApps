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
from app.services.ingestion.clip_generator import ClipGenerationResult

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
def _grid_env(tmp_path: Path, fake_video_path: Path, *, classify_mock, clip_mock=None):
    """Enter the common ingestion patches for a grid-classifier test.

    `classify_mock` is the mock to install for
    classify_frames_for_lineup_decision (an AsyncMock). Yields
    (mock_settings, mock_storage) for the test to configure further.

    `clip_mock` (PR2) replaces generate_clip_for_lineup. It defaults to a
    neutral AsyncMock returning a "skipped" result so clip generation is a
    no-op for the existing classifier tests; clip-specific tests pass their
    own to assert it was invoked with the reused on-disk video.

    A parenthesized `with (...)` cannot mix ``*tuple`` unpacking with ``as``
    bindings, so the shared patch set is entered via an ExitStack here.
    """
    from unittest.mock import AsyncMock as _AsyncMock

    from app.services.ingestion.clip_generator import ClipGenerationResult
    from app.services.ingestion.landing_clip_generator import (
        LandingClipGenerationResult,
    )

    if clip_mock is None:
        clip_mock = _AsyncMock(
            return_value=ClipGenerationResult(
                status="skipped", skip_reason="test_default"
            )
        )

    # PR5 landing-clip wire-up is also patched to a neutral no-op by default
    # so the existing classifier tests don't fire the real generator. The
    # orchestrator only invokes this when clip_result.status == "generated",
    # so the default clip_mock="skipped" already prevents the call — this
    # extra patch is a belt-and-suspenders guard for tests that pass a
    # custom clip_mock with status="generated" and care about clip
    # assertions, not landing.
    landing_mock = _AsyncMock(
        return_value=LandingClipGenerationResult(
            status="skipped", skip_reason="test_default"
        )
    )

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.list_videos", new_callable=AsyncMock, return_value=[FAKE_VIDEO]))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.fetch_video_detail", new_callable=AsyncMock, return_value=FAKE_VIDEO))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.download_video", new_callable=AsyncMock, return_value=fake_video_path))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.extract_frames", new_callable=AsyncMock, return_value=[_FAKE_PNG] * 5))
        mock_storage_factory = stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.get_storage"))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.classify_frames_for_lineup_decision", new=classify_mock))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.generate_clip_for_lineup", new=clip_mock))
        stack.enter_context(patch("app.services.ingestion.ingestion_orchestrator.generate_landing_clip_for_lineup", new=landing_mock))
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


class TestIngestClipWiring:
    """PR2: clip generation is wired into the ingest path, best-effort."""

    def _grid_result(self) -> ClassificationResult:
        return ClassificationResult(
            success=True,
            is_lineup=True,
            best_stand_index=2,
            best_aim_index=4,
            suggested_game_id=_FAKE_GAME_ID,
            suggested_map_id=_FAKE_MAP_ID,
            suggested_target_zone_id=_FAKE_ZONE_ID,
            suggested_side="side_a",
            suggested_utility_type_id=_FAKE_UT_ID,
            confidence=0.85,
            reasoning="Clear smoke throw",
            error_codes=[],
        )

    @pytest.mark.asyncio
    async def test_clip_gen_reuses_on_disk_video_and_gets_chapter_bounds(
        self, db: AsyncSession, source: Source, tmp_path: Path
    ):
        """is_lineup → generate_clip_for_lineup invoked with the already-
        downloaded video (no per-chapter re-download) + the chapter bounds +
        the resolved utility hint (grid confidence 0.85 > 0.6)."""
        ingestion_orchestrator = ingestion_orchestrator_module()
        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        classify_mock = AsyncMock(return_value=self._grid_result())
        clip_mock = AsyncMock(
            return_value=ClipGenerationResult(
                status="generated", clip_key="pending/vid_cls_001/0-clip.mp4"
            )
        )

        with _grid_env(
            tmp_path, fake_video_path,
            classify_mock=classify_mock, clip_mock=clip_mock,
        ) as (mock_settings, _):
            mock_settings.enable_classifier = True
            await ingestion_orchestrator.sync_source(source.id, db)

        clip_mock.assert_awaited_once()
        kwargs = clip_mock.call_args.kwargs
        assert kwargs["video_path"] == fake_video_path
        assert kwargs["chapter_start"] == 0.0
        assert kwargs["chapter_end"] == 60.0
        # _FAKE_UT_ID is seeded as slug "cls-smoke"; confidence 0.85 > 0.6.
        assert kwargs["utility_hint"] == "cls-smoke"

    @pytest.mark.asyncio
    async def test_clip_gen_not_called_when_not_a_lineup(
        self, db: AsyncSession, source: Source, tmp_path: Path
    ):
        ingestion_orchestrator = ingestion_orchestrator_module()
        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        classify_mock = AsyncMock(
            return_value=ClassificationResult(
                success=True, is_lineup=False, confidence=0.02,
                reasoning="not a lineup", error_codes=[],
            )
        )
        clip_mock = AsyncMock()

        with _grid_env(
            tmp_path, fake_video_path,
            classify_mock=classify_mock, clip_mock=clip_mock,
        ) as (mock_settings, _):
            mock_settings.enable_classifier = True
            await ingestion_orchestrator.sync_source(source.id, db)

        clip_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_clip_failure_is_non_fatal_to_the_chapter(
        self, db: AsyncSession, source: Source, tmp_path: Path
    ):
        """An unexpected clip-gen exception must NOT fail the chapter — the
        lineup is fully usable from its stills and is already committed."""
        ingestion_orchestrator = ingestion_orchestrator_module()
        fake_video_path = tmp_path / "vid_cls_001.mp4"
        fake_video_path.write_bytes(b"fake")

        classify_mock = AsyncMock(return_value=self._grid_result())
        clip_mock = AsyncMock(side_effect=RuntimeError("ffmpeg blew up"))

        with _grid_env(
            tmp_path, fake_video_path,
            classify_mock=classify_mock, clip_mock=clip_mock,
        ) as (mock_settings, _):
            mock_settings.enable_classifier = True
            stats = await ingestion_orchestrator.sync_source(source.id, db)

        # Chapter still counted as handled, no error, row persisted.
        assert stats.chapter_count == 1
        assert stats.error_count == 0
        rows = (
            await db.execute(
                select(Lineup).where(Lineup.youtube_video_id == "vid_cls_001")
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].status == "pending_review"
