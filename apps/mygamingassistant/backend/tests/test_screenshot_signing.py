"""Tests for the screenshot double-signing fix (Issue #1).

Two concerns:

1. ``_object_key_from_value`` — pure idempotency guard. A clean bare key is
   returned unchanged; a single-signed presigned URL peels back to the bare
   key; a double-encoded URL (URL whose object key is itself a URL-encoded
   URL — the exact corruption the bug produced) also peels to the bare key.

2. Signing must NEVER mutate the ORM column. ``_build_read`` signs on the
   ``LineupRead`` Pydantic model only. After ``lineup_service.get`` /
   ``accept`` (the latter commits the request session), re-querying the row
   must show ``stand_screenshot_url`` still holding the bare object key, not
   a presigned URL — the regression that corrupted the column.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch
from urllib.parse import quote

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.schemas.game.lineup_schemas import LineupAcceptBody
from app.services.game import lineup_service
from app.services.game.lineup_service import (
    _object_key_from_value,
    _sign_screenshot_url,
)

BUCKET = settings.minio_bucket


# ---------------------------------------------------------------------------
# _object_key_from_value — idempotency / peel
# ---------------------------------------------------------------------------

def test_clean_bare_key_unchanged():
    """A bare object key must pass through untouched (idempotent)."""
    key = "user-123/lineup-456/stand.png"
    assert _object_key_from_value(key) == key


def test_clean_pending_key_unchanged():
    """The ingestion-path key shape is also bare and must be untouched."""
    key = "pending/dQw4w9WgXcQ/3-stand.png"
    assert _object_key_from_value(key) == key


def test_single_signed_url_peels_to_bare_key():
    """A presigned GET URL must reduce to its bare object key."""
    key = "user-123/lineup-456/stand.png"
    signed = (
        f"https://minio.example.com/{BUCKET}/{key}"
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=abc"
    )
    assert _object_key_from_value(signed) == key


def test_double_encoded_url_peels_to_bare_key():
    """The exact corruption shape: a URL whose object key is a URL-encoded URL.

    The bug signed the column, persisted the URL into the key column, then
    signed *that* — producing a URL whose path segment is the percent-encoded
    earlier presigned URL. Peeling must recover the original bare key.
    """
    key = "user-123/lineup-456/stand.png"
    inner = f"https://minio.example.com/{BUCKET}/{key}?X-Amz-Signature=inner"
    outer = (
        f"https://minio.example.com/{BUCKET}/{quote(inner, safe='')}"
        "?X-Amz-Signature=outer"
    )
    assert _object_key_from_value(outer) == key


# ---------------------------------------------------------------------------
# Signing must not mutate the ORM column
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _mock_storage():
    mock = MagicMock()
    mock.bucket = BUCKET
    mock.generate_presigned_url.return_value = (
        "https://minio.example.com/bucket/signed-read-url?X-Amz-Signature=z"
    )
    # Signing (and the presign call) now lives in lineup_url_signing — patch
    # get_storage where it is looked up, not in lineup_service.
    with patch(
        "app.services.game.lineup_url_signing.get_storage", return_value=mock
    ):
        yield mock


@pytest_asyncio.fixture
async def seeded(db: AsyncSession) -> dict:
    game = Game(slug="sign-game", name="Sign Game", side_a_label="T", side_b_label="CT")
    db.add(game)
    await db.flush()
    map_obj = Map(game_id=game.id, slug="sign-map", name="Sign Map")
    db.add(map_obj)
    await db.flush()
    zone_t = MapZone(map_id=map_obj.id, slug="t", name="T", polygon_points=[])
    zone_s = MapZone(map_id=map_obj.id, slug="s", name="S", polygon_points=[])
    db.add_all([zone_t, zone_s])
    await db.flush()
    util = UtilityType(game_id=game.id, slug="smoke", name="Smoke")
    db.add(util)
    await db.flush()
    return {"game": game, "map": map_obj, "zt": zone_t, "zs": zone_s, "util": util}


BARE_STAND = "u-1/l-1/stand.png"
BARE_AIM = "u-1/l-1/aim.png"


@pytest.mark.asyncio
async def test_get_does_not_mutate_orm_key_column(db: AsyncSession, seeded: dict):
    """lineup_service.get returns a signed URL but leaves the column bare."""
    lineup = Lineup(
        game_id=seeded["game"].id,
        map_id=seeded["map"].id,
        target_zone_id=seeded["zt"].id,
        stand_zone_id=seeded["zs"].id,
        side="side_a",
        utility_type_id=seeded["util"].id,
        title="signing test",
        status="accepted",
        stand_screenshot_url=BARE_STAND,
        aim_screenshot_url=BARE_AIM,
    )
    db.add(lineup)
    await db.flush()
    lineup_id = lineup.id

    read = await lineup_service.get(db, lineup_id)
    assert read is not None
    # The Pydantic model carries the SIGNED url for the browser...
    assert read.stand_screenshot_url.startswith("http")

    # ...but the ORM column must still hold the BARE key.
    db.expire_all()
    row = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert row.stand_screenshot_url == BARE_STAND
    assert row.aim_screenshot_url == BARE_AIM


@pytest.mark.asyncio
async def test_get_signs_landing_screenshot_url(db: AsyncSession, seeded: dict):
    """landing_screenshot_url (preview-stills PR) is signed alongside
    stand/aim_screenshot_url — same bare-key-in / signed-URL-out contract,
    same non-mutation guarantee."""
    bare_landing = "u-1/l-1/landing-poster.webp"
    lineup = Lineup(
        game_id=seeded["game"].id,
        map_id=seeded["map"].id,
        target_zone_id=seeded["zt"].id,
        stand_zone_id=seeded["zs"].id,
        side="side_a",
        utility_type_id=seeded["util"].id,
        title="landing signing test",
        status="accepted",
        stand_screenshot_url=BARE_STAND,
        aim_screenshot_url=BARE_AIM,
        landing_screenshot_url=bare_landing,
    )
    db.add(lineup)
    await db.flush()
    lineup_id = lineup.id

    read = await lineup_service.get(db, lineup_id)
    assert read is not None
    assert read.landing_screenshot_url.startswith("http")

    db.expire_all()
    row = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert row.landing_screenshot_url == bare_landing


@pytest.mark.asyncio
async def test_accept_does_not_corrupt_orm_key_column(db: AsyncSession, seeded: dict):
    """accept() commits the session — the column must remain a bare key.

    This is the exact flow the original bug corrupted: accept persists the
    session, so any signing-time mutation of the ORM instance would be
    flushed into the object-key column.
    """
    lineup = Lineup(
        game_id=seeded["game"].id,
        map_id=seeded["map"].id,
        title="accept signing test",
        status="pending_review",
        stand_screenshot_url=BARE_STAND,
        aim_screenshot_url=BARE_AIM,
        suggested_target_zone_id=seeded["zt"].id,
        suggested_stand_zone_id=seeded["zs"].id,
        suggested_side="side_a",
        suggested_utility_type_id=seeded["util"].id,
    )
    db.add(lineup)
    await db.flush()
    lineup_id = lineup.id

    read = await lineup_service.accept(db, lineup_id, LineupAcceptBody())
    assert read is not None
    assert read.status == "accepted"
    assert read.stand_screenshot_url.startswith("http")

    db.expire_all()
    row = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    # Column unchanged — the bare key, not a presigned URL.
    assert row.stand_screenshot_url == BARE_STAND
    assert row.aim_screenshot_url == BARE_AIM
    assert not row.stand_screenshot_url.startswith("http")


# ---------------------------------------------------------------------------
# _sign_screenshot_url — presigned (local MinIO) vs public CDN (prod R2)
# ---------------------------------------------------------------------------
#
# Prod object storage is Cloudflare R2 served on a public custom domain. When
# settings.minio_public_base_url is set, public read URLs are emitted as plain
# {base}/{key} (no presigning, CDN-cacheable). When unset (local dev / CI),
# reads are presigned against MinIO as before. See
# memory/project_mga_prod_storage_r2.md.

R2_BASE = "https://mga-clips.myfreeapps.org"


def test_sign_returns_none_for_empty(monkeypatch):
    monkeypatch.setattr(settings, "minio_public_base_url", "")
    assert _sign_screenshot_url(None) is None
    assert _sign_screenshot_url("") is None


def test_sign_presigns_when_public_base_unset(monkeypatch, _mock_storage):
    """Local MinIO / CI: empty base → delegate to presigned signing."""
    monkeypatch.setattr(settings, "minio_public_base_url", "")
    url = _sign_screenshot_url("pending/vid/3-stand.png")
    _mock_storage.generate_presigned_url.assert_called_once()
    assert url == _mock_storage.generate_presigned_url.return_value


def test_sign_public_cdn_url_when_base_set(monkeypatch, _mock_storage):
    """Prod R2: base set → plain {base}/{key}, presigning NOT invoked."""
    monkeypatch.setattr(settings, "minio_public_base_url", R2_BASE)
    url = _sign_screenshot_url("pending/vid/3-stand.png")
    assert url == f"{R2_BASE}/pending/vid/3-stand.png"
    _mock_storage.generate_presigned_url.assert_not_called()


def test_sign_public_cdn_strips_trailing_slash(monkeypatch):
    monkeypatch.setattr(settings, "minio_public_base_url", R2_BASE + "/")
    url = _sign_screenshot_url("pending/vid/3-stand.png")
    assert url == f"{R2_BASE}/pending/vid/3-stand.png"  # no double slash


def test_sign_public_cdn_keeps_separators_encodes_unsafe(monkeypatch):
    """Path separators preserved; stray unsafe chars percent-encoded."""
    monkeypatch.setattr(settings, "minio_public_base_url", R2_BASE)
    url = _sign_screenshot_url("pending/v id/3-stand.png")
    assert url == f"{R2_BASE}/pending/v%20id/3-stand.png"


def test_sign_public_cdn_peels_corrupted_key_first(monkeypatch):
    """A row corrupted with a presigned URL still peels to the bare key before
    the CDN base is prefixed — never emit a nested URL."""
    monkeypatch.setattr(settings, "minio_public_base_url", R2_BASE)
    key = "pending/vid/3-stand.png"
    corrupted = f"https://minio.example.com/{BUCKET}/{key}?X-Amz-Signature=abc"
    assert _sign_screenshot_url(corrupted) == f"{R2_BASE}/{key}"
