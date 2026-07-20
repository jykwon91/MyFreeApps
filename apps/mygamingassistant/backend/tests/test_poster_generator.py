"""Unit tests for poster_generator.generate_posters_for_lineup.

DB-backed (real ``db`` fixture + ``create_lineup`` + the real repo setters, so
the one-column-commit persistence is exercised) but with the two side effects
that reach outside the DB mocked out:
  - storage download/upload — a tiny in-memory fake that records calls;
  - ffmpeg last-frame extraction (``extract_last_frame_webp``) — patched to
    return canned WebP bytes so no real ffmpeg binary is needed.

Covers the four outcomes the ingest + backfill paths depend on: both sides
generated, per-side skip when a clip is absent, whole-lineup skip when there's
no source-video key, and a structured ``failed`` on a storage/ffmpeg fault
(never a silent swallow — per rules/check-third-party-error-codes.md).
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion import poster_generator
from app.services.ingestion.poster_generator import generate_posters_for_lineup

_FAKE_WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "


class _FakeStorage:
    """Records download/upload calls; returns canned clip bytes on download."""

    def __init__(self, *, download_error: bool = False):
        self._download_error = download_error
        self.downloaded: list[str] = []
        self.uploaded: list[tuple[str, bytes, str]] = []

    def download_file(self, key: str) -> bytes:
        if self._download_error:
            raise RuntimeError("simulated storage fault")
        self.downloaded.append(key)
        return b"fake clip bytes"

    def upload_file(self, key: str, content: bytes, content_type: str) -> str:
        self.uploaded.append((key, content, content_type))
        return key


async def _make_lineup(db: AsyncSession, **overrides) -> Lineup:
    # pending_review avoids the ck_lineup_accepted_classified constraint (an
    # accepted row needs the classifier FKs). poster_generator doesn't filter
    # on status — it operates on whatever lineup it's handed — so this is a
    # faithful test of the generator + real repo persistence.
    fields = {
        "title": "poster gen test",
        "status": "pending_review",
        "youtube_video_id": "vidPG1",
        "chapter_start_seconds": 12,
        "stand_clip_url": "pending/vidPG1/12-stand.mp4",
        "landing_clip_url": "pending/vidPG1/12-landing.mp4",
    }
    fields.update(overrides)
    return await lineup_repo.create_lineup(db, fields)


@pytest.mark.asyncio
async def test_both_posters_generated_and_persisted(db: AsyncSession):
    lineup = await _make_lineup(db)
    storage = _FakeStorage()

    with patch.object(
        poster_generator, "extract_last_frame_webp", return_value=_FAKE_WEBP,
    ):
        result = await generate_posters_for_lineup(db, lineup, storage=storage)

    assert result.stand_status == "generated"
    assert result.landing_status == "generated"
    assert result.stand_key == "pending/vidPG1/12-stand-poster.webp"
    assert result.landing_key == "pending/vidPG1/12-landing-poster.webp"

    # Both source clips downloaded, both posters uploaded as WebP.
    assert storage.downloaded == [
        "pending/vidPG1/12-stand.mp4",
        "pending/vidPG1/12-landing.mp4",
    ]
    assert {k for k, _, _ in storage.uploaded} == {
        "pending/vidPG1/12-stand-poster.webp",
        "pending/vidPG1/12-landing-poster.webp",
    }
    assert all(ct == "image/webp" for _, _, ct in storage.uploaded)

    # Keys persisted onto the row (survives a fresh fetch — real commit).
    lineup_id = lineup.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_screenshot_url == "pending/vidPG1/12-stand-poster.webp"
    assert refetched.landing_screenshot_url == "pending/vidPG1/12-landing-poster.webp"


@pytest.mark.asyncio
async def test_side_skipped_when_clip_absent(db: AsyncSession):
    """A lineup with only a stand clip generates only the stand poster."""
    lineup = await _make_lineup(db, landing_clip_url=None)
    storage = _FakeStorage()

    with patch.object(
        poster_generator, "extract_last_frame_webp", return_value=_FAKE_WEBP,
    ):
        result = await generate_posters_for_lineup(db, lineup, storage=storage)

    assert result.stand_status == "generated"
    assert result.landing_status == "skipped"
    assert result.landing_key is None
    assert storage.downloaded == ["pending/vidPG1/12-stand.mp4"]


@pytest.mark.asyncio
async def test_whole_lineup_skipped_without_source_video(db: AsyncSession):
    """No youtube_video_id → nothing to key a poster on; both sides skip."""
    lineup = await _make_lineup(db, youtube_video_id=None)
    storage = _FakeStorage()

    with patch.object(
        poster_generator, "extract_last_frame_webp", return_value=_FAKE_WEBP,
    ):
        result = await generate_posters_for_lineup(db, lineup, storage=storage)

    assert result.stand_status == "skipped"
    assert result.landing_status == "skipped"
    assert storage.downloaded == []
    assert storage.uploaded == []


@pytest.mark.asyncio
async def test_download_fault_is_structured_failure(db: AsyncSession):
    """A storage fault yields a structured ``failed`` with an error code —
    never a silent swallow, and never a raised exception to the caller."""
    lineup = await _make_lineup(db)
    storage = _FakeStorage(download_error=True)

    with patch.object(
        poster_generator, "extract_last_frame_webp", return_value=_FAKE_WEBP,
    ):
        result = await generate_posters_for_lineup(db, lineup, storage=storage)

    assert result.stand_status == "failed"
    assert result.landing_status == "failed"
    assert result.stand_error_codes == ["download-failed:RuntimeError"]
    assert result.landing_error_codes == ["download-failed:RuntimeError"]

    # Nothing persisted — the screenshot columns stay null.
    lineup_id = lineup.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_screenshot_url is None
    assert refetched.landing_screenshot_url is None
