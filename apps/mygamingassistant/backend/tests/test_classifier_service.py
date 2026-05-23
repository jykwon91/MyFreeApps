"""Unit tests for the Claude lineup classifier service.

All Anthropic SDK calls are mocked. Tests verify:
  - Prompt construction produces expected system + user message shape
  - Slug resolver maps valid slugs → FK UUIDs
  - Slug resolver records failures for unknown slugs
  - Error handling: RateLimitError, APIStatusError produce correct error_codes
  - JSON parse failure returns success=False with json_parse_error code
  - Missing ANTHROPIC_API_KEY returns missing_api_key error code
"""
from __future__ import annotations

import base64
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.models.game.source import Source


# ---------------------------------------------------------------------------
# DB fixtures
#
# These seed by GET-OR-CREATE, never blind INSERT. The conftest `db` fixture
# rolls back on teardown, but the shared dev DB may ALREADY contain a
# `valorant` game / `bind` map etc. (e.g. from a diagnostic
# `python -m app.cli load-fixtures`). A blind `db.add(Game(slug="valorant"))`
# then raises `UniqueViolation: ix_game_slug` and errors out the whole class.
# Get-or-create is isolation-safe regardless of pre-existing dev-DB rows and
# matches how the 290+ other passing tests seed reference data.
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def game_val(db: AsyncSession) -> Game:
    existing = (
        await db.execute(select(Game).where(Game.slug == "valorant"))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    g = Game(slug="valorant", name="VALORANT", side_a_label="Attacker", side_b_label="Defender")
    db.add(g)
    await db.flush()
    return g


@pytest_asyncio.fixture
async def map_bind(db: AsyncSession, game_val: Game) -> Map:
    existing = (
        await db.execute(
            select(Map).where(Map.game_id == game_val.id, Map.slug == "bind")
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    m = Map(game_id=game_val.id, slug="bind", name="Bind")
    db.add(m)
    await db.flush()
    return m


@pytest_asyncio.fixture
async def zone_a_short(db: AsyncSession, map_bind: Map) -> MapZone:
    existing = (
        await db.execute(
            select(MapZone).where(
                MapZone.map_id == map_bind.id, MapZone.slug == "a-short"
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    z = MapZone(map_id=map_bind.id, slug="a-short", name="A Short")
    db.add(z)
    await db.flush()
    return z


@pytest_asyncio.fixture
async def zone_b_site(db: AsyncSession, map_bind: Map) -> MapZone:
    existing = (
        await db.execute(
            select(MapZone).where(
                MapZone.map_id == map_bind.id, MapZone.slug == "b-site"
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    z = MapZone(map_id=map_bind.id, slug="b-site", name="B Site")
    db.add(z)
    await db.flush()
    return z


@pytest_asyncio.fixture
async def utility_smoke(db: AsyncSession, game_val: Game) -> UtilityType:
    existing = (
        await db.execute(
            select(UtilityType).where(
                UtilityType.game_id == game_val.id, UtilityType.slug == "smoke"
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    ut = UtilityType(game_id=game_val.id, slug="smoke", name="Smoke")
    db.add(ut)
    await db.flush()
    return ut


@pytest_asyncio.fixture
async def source_fix(db: AsyncSession) -> Source:
    # Source has no natural unique slug; a fresh row per test is fine and the
    # conftest rollback discards it. (Source is not part of the dev-DB fixture
    # load, so there's no cross-run collision to guard against here.)
    s = Source(kind="youtube_playlist", config_json={"url": "https://test"})
    db.add(s)
    await db.flush()
    return s


@pytest_asyncio.fixture
async def pending_lineup(
    db: AsyncSession,
    game_val: Game,
    map_bind: Map,
    source_fix: Source,
) -> Lineup:
    lineup = Lineup(
        game_id=game_val.id,
        map_id=map_bind.id,
        source_id=source_fix.id,
        title="A short smoke from spawn",
        chapter_title="A short smoke from spawn",
        attribution_author="TestCreator",
        stand_screenshot_url="pending/vid001/0-stand.png",
        aim_screenshot_url="pending/vid001/0-aim.png",
        status="pending_review",
    )
    db.add(lineup)
    await db.flush()
    return lineup


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100


def _make_anthropic_response(json_payload: dict) -> MagicMock:
    """Build a mock anthropic.Message-like response with one text content block."""
    resp = MagicMock()
    text_block = MagicMock()
    text_block.text = json.dumps(json_payload)
    resp.content = [text_block]
    return resp


# ---------------------------------------------------------------------------
# Tests: classify_lineup happy path
# ---------------------------------------------------------------------------

class TestClassifyLineup:
    @pytest.mark.asyncio
    async def test_successful_classification(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
        zone_a_short: MapZone,
        zone_b_site: MapZone,
        utility_smoke: UtilityType,
    ):
        """Happy path: classifier returns valid slugs → FK IDs written to lineup."""
        from app.services.classification.classifier_service import classify_lineup

        classifier_output = {
            "game_slug": "valorant",
            "map_slug": "bind",
            "target_zone_slug": "a-short",
            "stand_zone_slug": "b-site",
            "side": "side_a",
            "utility_type_slug": "smoke",
            "aim_anchor_x": 0.52,
            "aim_anchor_y": 0.48,
            "confidence": 0.88,
            "reasoning": "Clear smoke throw visible, A short zone.",
        }

        with (
            patch(
                "app.services.classification.classifier_service._fetch_screenshot_bytes",
                return_value=_FAKE_PNG,
            ),
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_anthropic_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"

            mock_client = MagicMock()
            mock_anthropic_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(classifier_output)

            result = await classify_lineup(db, pending_lineup.id)

        assert result.success is True
        assert result.suggested_game_id is not None
        assert result.suggested_map_id is not None
        assert result.suggested_target_zone_id == zone_a_short.id
        assert result.suggested_stand_zone_id == zone_b_site.id
        assert result.suggested_side == "side_a"
        assert result.suggested_utility_type_id == utility_smoke.id
        assert result.aim_anchor_x == pytest.approx(0.52)
        assert result.aim_anchor_y == pytest.approx(0.48)
        assert result.confidence == pytest.approx(0.88)
        assert result.error_codes == []

        # Verify lineup row was mutated (flush called)
        assert pending_lineup.suggested_target_zone_id == zone_a_short.id
        assert pending_lineup.suggested_side == "side_a"

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_error(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
    ):
        """Missing ANTHROPIC_API_KEY → success=False, error_codes=['missing_api_key']."""
        from app.services.classification.classifier_service import classify_lineup

        with patch("app.services.classification.classifier_service.settings") as mock_settings:
            mock_settings.anthropic_api_key = ""
            mock_settings.enable_classifier = True
            result = await classify_lineup(db, pending_lineup.id)

        assert result.success is False
        assert "missing_api_key" in result.error_codes

    @pytest.mark.asyncio
    async def test_json_parse_failure(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
    ):
        """Non-JSON response from Claude → success=False, error_codes=['json_parse_error']."""
        from app.services.classification.classifier_service import classify_lineup

        bad_response = MagicMock()
        bad_text = MagicMock()
        bad_text.text = "Sorry, I cannot classify this image."
        bad_response.content = [bad_text]

        with (
            patch(
                "app.services.classification.classifier_service._fetch_screenshot_bytes",
                return_value=_FAKE_PNG,
            ),
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = bad_response

            result = await classify_lineup(db, pending_lineup.id)

        assert result.success is False
        assert "json_parse_error" in result.error_codes

    @pytest.mark.asyncio
    async def test_rate_limit_error(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
    ):
        """RateLimitError → success=False, error_codes contains rate limit type."""
        import anthropic as anthropic_lib
        from app.services.classification.classifier_service import classify_lineup

        with (
            patch(
                "app.services.classification.classifier_service._fetch_screenshot_bytes",
                return_value=_FAKE_PNG,
            ),
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client

            exc = anthropic_lib.RateLimitError.__new__(anthropic_lib.RateLimitError)
            exc.type = "rate_limit_error"
            exc.args = ("rate limit exceeded",)
            mock_client.messages.create.side_effect = exc

            result = await classify_lineup(db, pending_lineup.id)

        assert result.success is False
        assert any("rate_limit" in code for code in result.error_codes)

    @pytest.mark.asyncio
    async def test_api_status_error(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
    ):
        """APIStatusError → success=False, error_codes contains the status error type."""
        import anthropic as anthropic_lib
        from app.services.classification.classifier_service import classify_lineup

        with (
            patch(
                "app.services.classification.classifier_service._fetch_screenshot_bytes",
                return_value=_FAKE_PNG,
            ),
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client

            mock_response = MagicMock()
            mock_response.status_code = 529
            exc = anthropic_lib.APIStatusError.__new__(anthropic_lib.APIStatusError)
            exc.status_code = 529
            exc.type = "overloaded_error"
            exc.args = ("api overloaded",)
            mock_client.messages.create.side_effect = exc

            result = await classify_lineup(db, pending_lineup.id)

        assert result.success is False
        # Should contain the status error type or fallback
        assert len(result.error_codes) > 0


# ---------------------------------------------------------------------------
# Tests: slug resolver
# ---------------------------------------------------------------------------

class TestSlugResolver:
    @pytest.mark.asyncio
    async def test_valid_slugs_resolve(
        self,
        db: AsyncSession,
        game_val: Game,
        map_bind: Map,
        zone_a_short: MapZone,
        zone_b_site: MapZone,
        utility_smoke: UtilityType,
    ):
        """All valid slugs → all FK IDs resolved, no failures."""
        from app.repositories.game.reference_repo import resolve_slugs

        game_id, map_id, tz_id, sz_id, ut_id, failures, codes = await resolve_slugs(
            db,
            game_slug="valorant",
            map_slug="bind",
            target_zone_slug="a-short",
            stand_zone_slug="b-site",
            utility_type_slug="smoke",
        )

        assert game_id == game_val.id
        assert map_id == map_bind.id
        assert tz_id == zone_a_short.id
        assert sz_id == zone_b_site.id
        assert ut_id == utility_smoke.id
        assert failures == []
        assert codes == []

    @pytest.mark.asyncio
    async def test_unknown_zone_slug_records_failure(
        self,
        db: AsyncSession,
        game_val: Game,
        map_bind: Map,
    ):
        """A hallucinated zone slug → map/game resolve, zone fails with message."""
        from app.repositories.game.reference_repo import resolve_slugs

        _, _, tz_id, _, _, failures, codes = await resolve_slugs(
            db,
            game_slug="valorant",
            map_slug="bind",
            target_zone_slug="hallucinated-zone",
            stand_zone_slug=None,
            utility_type_slug=None,
        )

        assert tz_id is None
        assert any("hallucinated-zone" in f for f in failures)
        # Structured code emitted alongside prose (not prose-only).
        assert any(
            c.startswith("unresolved_slug:target_zone:hallucinated-zone:")
            for c in codes
        )

    @pytest.mark.asyncio
    async def test_unknown_game_slug_cascades(
        self,
        db: AsyncSession,
    ):
        """Unknown game slug → game fails; map/zone/utility all fail with cascade note."""
        from app.repositories.game.reference_repo import resolve_slugs

        game_id, map_id, tz_id, sz_id, ut_id, failures, codes = await resolve_slugs(
            db,
            game_slug="fortnite",
            map_slug="some-map",
            target_zone_slug="some-zone",
            stand_zone_slug="some-zone",
            utility_type_slug="some-util",
        )

        assert game_id is None
        assert map_id is None
        assert tz_id is None
        assert sz_id is None
        assert ut_id is None
        # All four downstream failures should note the cascade
        assert len(failures) >= 1
        # Structured codes mirror the prose failures.
        assert len(codes) >= 1
        assert any(c.startswith("unresolved_slug:game:fortnite:") for c in codes)


# ---------------------------------------------------------------------------
# Tests: reference text builder
# ---------------------------------------------------------------------------

class TestReferenceTextBuilder:
    def test_includes_game_slugs(self):
        from app.services.classification.classifier_service import _build_reference_text

        ref = {
            "games": [
                {"slug": "valorant", "name": "VALORANT", "side_a_label": "Attacker", "side_b_label": "Defender"},
            ],
            "maps": [
                {"slug": "bind", "name": "Bind", "game_slug": "valorant", "zones": [{"slug": "a-short", "name": "A Short"}]},
            ],
            "utility_types": [
                {"slug": "smoke", "name": "Smoke", "game_slug": "valorant"},
            ],
        }
        text = _build_reference_text(ref, game_hint="valorant")
        assert "valorant" in text
        assert "bind" in text
        assert "a-short" in text
        assert "smoke" in text
        assert "Attacker" in text

    def test_game_hint_included(self):
        from app.services.classification.classifier_service import _build_reference_text

        ref = {"games": [], "maps": [], "utility_types": []}
        text = _build_reference_text(ref, game_hint="cs2")
        assert "cs2" in text

    def test_no_game_hint_omitted(self):
        from app.services.classification.classifier_service import _build_reference_text

        ref = {"games": [], "maps": [], "utility_types": []}
        text = _build_reference_text(ref, game_hint=None)
        assert "Expected game" not in text


# ---------------------------------------------------------------------------
# Tests: Strategy A grid classifier (classify_frames_for_lineup_decision)
# ---------------------------------------------------------------------------

_THREE_FRAMES = [_FAKE_PNG, _FAKE_PNG, _FAKE_PNG]


# Collision-proof reference fixtures for the grid tests. The shared
# game_val/map_bind/zone/utility fixtures hardcode slug='valorant'/'bind'
# which collides on ix_game_slug under the SAVEPOINT-restart conftest (the
# documented pre-existing 7 errors in TestClassifyLineup/TestSlugResolver —
# NOT this class's bug). These grid tests deliberately use unique slugs so
# they pass independently of that pre-existing breakage and never add to it.
_GRID_SLUG_SUFFIX = uuid.uuid4().hex[:8]


@pytest_asyncio.fixture
async def grid_game(db: AsyncSession) -> Game:
    g = Game(
        slug=f"grid-game-{_GRID_SLUG_SUFFIX}",
        name="Grid Test Game",
        side_a_label="Attacker",
        side_b_label="Defender",
    )
    db.add(g)
    await db.flush()
    return g


@pytest_asyncio.fixture
async def grid_map(db: AsyncSession, grid_game: Game) -> Map:
    m = Map(
        game_id=grid_game.id,
        slug=f"grid-map-{_GRID_SLUG_SUFFIX}",
        name="Grid Test Map",
    )
    db.add(m)
    await db.flush()
    return m


@pytest_asyncio.fixture
async def grid_zone(db: AsyncSession, grid_map: Map) -> MapZone:
    z = MapZone(
        map_id=grid_map.id,
        slug=f"grid-zone-{_GRID_SLUG_SUFFIX}",
        name="Grid Zone",
    )
    db.add(z)
    await db.flush()
    return z


@pytest_asyncio.fixture
async def grid_utility(db: AsyncSession, grid_game: Game) -> UtilityType:
    ut = UtilityType(
        game_id=grid_game.id,
        slug=f"grid-smoke-{_GRID_SLUG_SUFFIX}",
        name="Grid Smoke",
    )
    db.add(ut)
    await db.flush()
    return ut


class TestClassifyFramesForLineupDecision:
    @pytest.mark.asyncio
    async def test_is_lineup_true_resolves_slugs_and_picks_frames(
        self,
        db: AsyncSession,
        grid_game: Game,
        grid_map: Map,
        grid_zone: MapZone,
        grid_utility: UtilityType,
    ):
        """is_lineup=True → slugs resolved to FK IDs, chosen indices returned."""
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        payload = {
            "is_lineup": True,
            "best_stand_index": 2,
            "best_aim_index": 3,
            "game_slug": grid_game.slug,
            "map_slug": grid_map.slug,
            "target_zone_slug": grid_zone.slug,
            "stand_zone_slug": None,
            "side": "side_a",
            "utility_type_slug": grid_utility.slug,
            "aim_anchor_x": 0.4,
            "aim_anchor_y": 0.6,
            "confidence": 0.9,
            "reasoning": "Smoke lineup for A short.",
        }

        with (
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(payload)

            result = await classify_frames_for_lineup_decision(
                db,
                frames=_THREE_FRAMES,
                chapter_title="A short smoke",
                attribution_author="TestCreator",
            )

        assert result.success is True
        assert result.is_lineup is True
        assert result.best_stand_index == 2
        assert result.best_aim_index == 3
        assert result.suggested_target_zone_id == grid_zone.id
        assert result.suggested_utility_type_id == grid_utility.id
        assert result.suggested_side == "side_a"
        assert result.aim_anchor_x == pytest.approx(0.4)
        assert result.confidence == pytest.approx(0.9)
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_is_lineup_false_returns_early_no_slug_resolution(
        self,
        db: AsyncSession,
        grid_game: Game,
    ):
        """is_lineup=False → success=True, is_lineup=False, no suggested FKs."""
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        payload = {
            "is_lineup": False,
            "best_stand_index": None,
            "best_aim_index": None,
            "game_slug": None,
            "confidence": 0.03,
            "reasoning": "Intro card / webcam — not a lineup.",
        }

        with (
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(payload)

            result = await classify_frames_for_lineup_decision(
                db,
                frames=_THREE_FRAMES,
                chapter_title="Intro",
                attribution_author="TestCreator",
            )

        assert result.success is True
        assert result.is_lineup is False
        assert result.best_stand_index is None
        assert result.best_aim_index is None
        assert result.suggested_game_id is None
        assert result.confidence == pytest.approx(0.03)
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_out_of_range_indices_nulled(
        self,
        db: AsyncSession,
        grid_game: Game,
        grid_map: Map,
    ):
        """best_*_index outside [1,n] is rejected → None, note in reasoning."""
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        payload = {
            "is_lineup": True,
            "best_stand_index": 0,   # invalid (1-based)
            "best_aim_index": 99,    # invalid (> n)
            "game_slug": grid_game.slug,
            "map_slug": grid_map.slug,
            "side": "any",
            "confidence": 0.7,
            "reasoning": "Lineup but bad indices.",
        }

        with (
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(payload)

            result = await classify_frames_for_lineup_decision(
                db,
                frames=_THREE_FRAMES,
                chapter_title="A site",
                attribution_author="TestCreator",
            )

        assert result.success is True
        assert result.is_lineup is True
        assert result.best_stand_index is None
        assert result.best_aim_index is None
        assert "best_stand_index" in result.reasoning
        assert "best_aim_index" in result.reasoning

    @pytest.mark.asyncio
    async def test_empty_frames_returns_error(self, db: AsyncSession):
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        with patch("app.services.classification.classifier_service.settings") as mock_settings:
            mock_settings.anthropic_api_key = "sk-test"
            result = await classify_frames_for_lineup_decision(
                db, frames=[], chapter_title="x", attribution_author="y"
            )

        assert result.success is False
        assert "no_frames" in result.error_codes

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_error(self, db: AsyncSession):
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        with patch("app.services.classification.classifier_service.settings") as mock_settings:
            mock_settings.anthropic_api_key = ""
            result = await classify_frames_for_lineup_decision(
                db, frames=_THREE_FRAMES, chapter_title="x", attribution_author="y"
            )

        assert result.success is False
        assert "missing_api_key" in result.error_codes

    @pytest.mark.asyncio
    async def test_json_parse_failure(self, db: AsyncSession, grid_game: Game):
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        bad_response = MagicMock()
        bad_text = MagicMock()
        bad_text.text = "I cannot classify these frames."
        bad_response.content = [bad_text]

        with (
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = bad_response

            result = await classify_frames_for_lineup_decision(
                db,
                frames=_THREE_FRAMES,
                chapter_title="x",
                attribution_author="y",
            )

        assert result.success is False
        assert "json_parse_error" in result.error_codes

    @pytest.mark.asyncio
    async def test_n_images_sent_to_claude(
        self, db: AsyncSession, grid_game: Game
    ):
        """All N frames must be in the user content as image blocks."""
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        payload = {"is_lineup": False, "confidence": 0.0, "reasoning": "x"}

        with (
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(payload)

            await classify_frames_for_lineup_decision(
                db,
                frames=_THREE_FRAMES,
                chapter_title="x",
                attribution_author="y",
            )

        _, kwargs = mock_client.messages.create.call_args
        content = kwargs["messages"][0]["content"]
        image_blocks = [b for b in content if b.get("type") == "image"]
        assert len(image_blocks) == 3
        # Reference block is still cache_control'd (caching preserved).
        assert any(b.get("cache_control") for b in content)
        assert kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}


# ---------------------------------------------------------------------------
# Tests: game-first disambiguation prompt + cross-game consistency guard
# (regression for CS2 Mirage misclassified as Valorant Ascent)
# ---------------------------------------------------------------------------

# A reference dict where 'mirage' is a CS2 map and 'ascent' is a Valorant map —
# mirrors the real fixture asymmetry that produced the misclassification.
_CROSS_GAME_REF: dict = {
    "games": [
        {"slug": "cs2", "name": "Counter-Strike 2", "side_a_label": "T", "side_b_label": "CT"},
        {"slug": "valorant", "name": "VALORANT", "side_a_label": "Attacker", "side_b_label": "Defender"},
    ],
    "maps": [
        {"slug": "mirage", "name": "Mirage", "game_slug": "cs2", "zones": [{"slug": "a-site", "name": "A Site"}]},
        {"slug": "ascent", "name": "Ascent", "game_slug": "valorant", "zones": [{"slug": "market", "name": "Market"}]},
    ],
    "utility_types": [
        {"slug": "smoke", "name": "Smoke", "game_slug": "cs2"},
    ],
}


class TestGameFirstPromptWiring:
    """Both system-prompt paths must carry the visual-cue block + game-first rule."""

    def _single_image_system_prompt(self) -> str:
        """Reconstruct the single-image (classify_lineup) system prompt."""
        from app.services.classification import classifier_service as cs

        return (
            "You are classifying tactical-FPS utility lineup screenshots.\n"
            "Your task: identify the game, map, zones, side, and utility type from the screenshot "
            "and chapter metadata. Return the crosshair/aim anchor position on the aim screenshot.\n\n"
            + cs._GAME_VISUAL_CUES
            + "\n"
            + cs._GAME_FIRST_RULE
            + "\n"
            + cs._OUTPUT_SCHEMA_DOC
        )

    def _grid_system_prompt(self, n: int = 5) -> str:
        """Reconstruct the grid (classify_frames_for_lineup_decision) system prompt."""
        from app.services.classification import classifier_service as cs

        return (
            "You are classifying tactical-FPS utility lineup screenshots.\n"
            "You will receive several numbered candidate frames from ONE video "
            "chapter and must judge whether the chapter is a real utility-lineup "
            "demo, pick the best frames, and classify it.\n\n"
            + cs._GAME_VISUAL_CUES
            + "\n"
            + cs._GAME_FIRST_RULE
            + "\n"
            + cs._GRID_OUTPUT_SCHEMA_DOC.format(n=n)
        )

    def test_single_image_prompt_has_game_first_and_cues(self):
        prompt = self._single_image_system_prompt()
        assert "DETERMINE game_slug FIRST" in prompt
        assert "NAME-COLLISION WARNING" in prompt
        assert "C / Q / E / X" in prompt  # Valorant ability HUD cue
        assert "$3800" in prompt  # CS2 buy-money HUD cue
        assert "CLASSIFICATION ORDER" in prompt
        # Schema doc still present after the new blocks (order preserved).
        assert "Return ONLY valid JSON" in prompt

    def test_grid_prompt_has_game_first_and_cues(self):
        prompt = self._grid_system_prompt()
        assert "DETERMINE game_slug FIRST" in prompt
        assert "NAME-COLLISION WARNING" in prompt
        assert "C / Q / E / X" in prompt
        assert "$3800" in prompt
        assert "CLASSIFICATION ORDER" in prompt
        # Grid schema's new game_slug bullet present and references the order rule.
        assert "constrain all map/zone/utility slugs to entries tagged" in prompt
        # Grid schema body still present.
        assert "is_lineup" in prompt

    def test_grid_schema_format_does_not_break(self):
        """_GRID_OUTPUT_SCHEMA_DOC.format(n=...) must still substitute n cleanly.

        The literal JSON-example braces are escaped as ``{{``/``}}`` so the only
        substitution is ``{n}``. A stray single brace would raise KeyError/
        ValueError here — proving the new game_slug bullet did not break the
        .format template.
        """
        from app.services.classification import classifier_service as cs

        rendered = cs._GRID_OUTPUT_SCHEMA_DOC.format(n=7)  # must not raise
        assert "Frame 1 .. Frame 7" in rendered
        assert "(1-7)" in rendered  # {n} substituted inside the JSON example
        # The new game_slug rule bullet survived the format round-trip intact.
        assert "constrain all map/zone/utility slugs to entries tagged" in rendered


class TestCheckGameMapConsistency:
    """Defense-in-depth: map_slug belonging to a different game than game_slug."""

    def test_cross_game_mismatch_nulls_map_and_zones(self):
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        # game_slug says valorant, but 'mirage' is a cs2 map → contamination.
        parsed = {
            "game_slug": "valorant",
            "map_slug": "mirage",
            "target_zone_slug": "a-site",
            "stand_zone_slug": "a-site",
            "side": "side_a",
            "utility_type_slug": "smoke",
            "aim_anchor_x": 0.5,
            "aim_anchor_y": 0.5,
            "confidence": 0.9,
        }
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result["map_slug"] is None
        assert result["target_zone_slug"] is None
        assert result["stand_zone_slug"] is None
        # confidence reduced by 0.4 (0.9 - 0.4 = 0.5), floored at 0.0
        assert result["confidence"] == pytest.approx(0.5)
        # game/side/utility/aim untouched
        assert result["game_slug"] == "valorant"
        assert result["side"] == "side_a"
        assert result["utility_type_slug"] == "smoke"
        assert result["aim_anchor_x"] == pytest.approx(0.5)
        assert len(failures) == 1
        assert "CROSS-GAME MISMATCH" in failures[0]
        assert "mirage" in failures[0]
        assert "valorant" in failures[0]
        assert "cs2" in failures[0]
        # original dict not mutated (guard returns a copy on mismatch)
        assert parsed["map_slug"] == "mirage"

    def test_consistent_game_map_unchanged(self):
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {
            "game_slug": "cs2",
            "map_slug": "mirage",
            "target_zone_slug": "a-site",
            "stand_zone_slug": "a-site",
            "confidence": 0.85,
        }
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result["map_slug"] == "mirage"
        assert result["target_zone_slug"] == "a-site"
        assert result["confidence"] == pytest.approx(0.85)
        assert failures == []

    def test_map_slug_absent_from_ref_unchanged(self):
        """A truly-absent map slug is left for the slug resolver to catch."""
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {
            "game_slug": "cs2",
            "map_slug": "nonexistent-map",
            "confidence": 0.7,
        }
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result["map_slug"] == "nonexistent-map"
        assert result["confidence"] == pytest.approx(0.7)
        assert failures == []

    def test_null_game_slug_unchanged(self):
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {"game_slug": None, "map_slug": "mirage", "confidence": 0.5}
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result == parsed
        assert failures == []

    def test_null_map_slug_unchanged(self):
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {"game_slug": "cs2", "map_slug": None, "confidence": 0.5}
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result == parsed
        assert failures == []

    def test_confidence_none_on_mismatch_no_crash(self):
        """A mismatch with confidence=None must not crash; map/zones still nulled."""
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {
            "game_slug": "valorant",
            "map_slug": "mirage",
            "target_zone_slug": "a-site",
            "confidence": None,
        }
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result["map_slug"] is None
        assert result["target_zone_slug"] is None
        assert result["confidence"] is None  # untouched when None
        assert len(failures) == 1

    def test_confidence_non_numeric_on_mismatch_floored(self):
        """A mismatch with a non-numeric confidence must floor to 0.0, not crash."""
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {
            "game_slug": "valorant",
            "map_slug": "mirage",
            "confidence": "high",
        }
        failures: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures)

        assert result["map_slug"] is None
        assert result["confidence"] == pytest.approx(0.0)
        assert len(failures) == 1


class TestGridMaxTokens:
    """Regression: grid path bumped to 700 max_tokens for richer game evidence."""

    @pytest.mark.asyncio
    async def test_grid_max_tokens_is_700(self, db: AsyncSession, grid_game: Game):
        from app.services.classification.classifier_service import (
            classify_frames_for_lineup_decision,
        )

        payload = {"is_lineup": False, "confidence": 0.0, "reasoning": "x"}

        with (
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(payload)

            await classify_frames_for_lineup_decision(
                db,
                frames=_THREE_FRAMES,
                chapter_title="x",
                attribution_author="y",
            )

        _, kwargs = mock_client.messages.create.call_args
        assert kwargs["max_tokens"] == 700


# ---------------------------------------------------------------------------
# Tests: hard game scoping + structured failure codes (finding #4 remediation)
# ---------------------------------------------------------------------------

# Unique slug suffix so these collision-proof fixtures never trip ix_game_slug
# against a pre-seeded dev DB (same discipline as the grid fixtures above).
_SCOPE_SUFFIX = uuid.uuid4().hex[:8]


@pytest_asyncio.fixture
async def cs2_game(db: AsyncSession) -> Game:
    """A CS2 game with a CS2-only map + zone. Slugs are suffixed to be
    isolation-safe regardless of pre-existing dev-DB rows."""
    g = Game(
        slug=f"cs2-{_SCOPE_SUFFIX}",
        name="Counter-Strike 2",
        side_a_label="T",
        side_b_label="CT",
    )
    db.add(g)
    await db.flush()
    m = Map(game_id=g.id, slug=f"mirage-{_SCOPE_SUFFIX}", name="Mirage")
    db.add(m)
    await db.flush()
    z = MapZone(map_id=m.id, slug=f"cs2-a-site-{_SCOPE_SUFFIX}", name="A Site")
    db.add(z)
    await db.flush()
    return g


@pytest_asyncio.fixture
async def valorant_only_zone(db: AsyncSession) -> MapZone:
    """A Valorant game with a Valorant-ONLY zone slug that does NOT exist
    under the CS2 game. Resolving this slug in a CS2 classification must fail
    by construction (different game_id → zero rows), not by prompt hinting."""
    g = Game(
        slug=f"valorant-{_SCOPE_SUFFIX}",
        name="VALORANT",
        side_a_label="Attacker",
        side_b_label="Defender",
    )
    db.add(g)
    await db.flush()
    m = Map(game_id=g.id, slug=f"ascent-{_SCOPE_SUFFIX}", name="Ascent")
    db.add(m)
    await db.flush()
    z = MapZone(map_id=m.id, slug=f"val-market-{_SCOPE_SUFFIX}", name="Market")
    db.add(z)
    await db.flush()
    return z


class TestHardGameScoping:
    """A CS2 classification CANNOT resolve a Valorant-only zone slug.

    This is the structural guarantee finding #4 demanded: game scope is a
    query filter (map/zone lookups are gated on the resolved game_id), not a
    prompt sentence. A Valorant zone slug points at a MapZone whose map
    belongs to the Valorant game_id; resolving it under the CS2 game_slug
    selects zero rows and records a structured failure.
    """

    @pytest.mark.asyncio
    async def test_cs2_cannot_resolve_valorant_zone_slug(
        self,
        db: AsyncSession,
        cs2_game: Game,
        valorant_only_zone: MapZone,
    ):
        from app.repositories.game.reference_repo import resolve_slugs

        cs2_map_slug = f"mirage-{_SCOPE_SUFFIX}"
        valorant_zone_slug = valorant_only_zone.slug  # f"val-market-{suffix}"

        (
            game_id,
            map_id,
            target_zone_id,
            stand_zone_id,
            utility_type_id,
            failures,
            codes,
        ) = await resolve_slugs(
            db,
            game_slug=f"cs2-{_SCOPE_SUFFIX}",
            map_slug=cs2_map_slug,
            # Valorant-only zone slug requested under a CS2 game/map:
            target_zone_slug=valorant_zone_slug,
            stand_zone_slug=None,
            utility_type_slug=None,
        )

        # Game + CS2 map resolve fine...
        assert game_id == cs2_game.id
        assert map_id is not None
        # ...but the Valorant zone is UNRESOLVABLE under the CS2 map_id.
        assert target_zone_id is None
        # And the failure is STRUCTURED, scoped to the classified game.
        assert any(
            c == f"unresolved_slug:target_zone:{valorant_zone_slug}:game=cs2-{_SCOPE_SUFFIX}"
            for c in codes
        ), codes
        assert any(valorant_zone_slug in f for f in failures)

    @pytest.mark.asyncio
    async def test_check_game_map_consistency_emits_structured_reject_code(self):
        """All-games path: a cross-game map is rejected with a structured code,
        not just a prose note + confidence penalty."""
        from app.services.classification.classifier_service import (
            _check_game_map_consistency,
        )

        parsed = {
            "game_slug": "valorant",
            "map_slug": "mirage",  # mirage is cs2 in _CROSS_GAME_REF
            "target_zone_slug": "a-site",
            "confidence": 0.9,
        }
        failures: list[str] = []
        codes: list[str] = []
        result = _check_game_map_consistency(parsed, _CROSS_GAME_REF, failures, codes)

        assert result["map_slug"] is None
        assert result["target_zone_slug"] is None
        # Structured code present and machine-parseable.
        assert codes == [
            "cross_game_rejected:map=mirage:classified=valorant:actual=cs2"
        ]
        # Prose still emitted (human path preserved).
        assert any("CROSS-GAME MISMATCH" in f for f in failures)


class TestStructuredFailureSurfacing:
    """An advertised slug that fails to resolve produces a STRUCTURED
    error_code on the (successful) ClassificationResult — not prose-only."""

    @pytest.mark.asyncio
    async def test_unresolved_advertised_slug_surfaces_structured_code(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
        zone_a_short: MapZone,
    ):
        from app.services.classification.classifier_service import classify_lineup

        # game/map/target zone resolve; stand_zone is a hallucinated slug the
        # prompt "advertised" but cannot resolve → structured code expected.
        classifier_output = {
            "game_slug": "valorant",
            "map_slug": "bind",
            "target_zone_slug": "a-short",
            "stand_zone_slug": "hallucinated-stand-zone",
            "side": "side_a",
            "utility_type_slug": "smoke",
            "aim_anchor_x": 0.5,
            "aim_anchor_y": 0.5,
            "confidence": 0.8,
            "reasoning": "Smoke throw, A short.",
        }

        with (
            patch(
                "app.services.classification.classifier_service._fetch_screenshot_bytes",
                return_value=_FAKE_PNG,
            ),
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(
                classifier_output
            )

            result = await classify_lineup(db, pending_lineup.id)

        # The CALL succeeded (Claude answered); the slug just didn't resolve.
        assert result.success is True
        assert result.suggested_target_zone_id == zone_a_short.id
        # Structured failure surfaced on BOTH the typed list AND error_codes
        # (so the existing ClassifyResponse.error_codes path shows it).
        assert any(
            c.startswith("unresolved_slug:stand_zone:hallucinated-stand-zone:")
            for c in result.classification_failures
        ), result.classification_failures
        assert any(
            c.startswith("unresolved_slug:stand_zone:hallucinated-stand-zone:")
            for c in result.error_codes
        ), result.error_codes
        # Prose still present for humans.
        assert "hallucinated-stand-zone" in result.reasoning

    @pytest.mark.asyncio
    async def test_invalid_confidence_is_logged_not_silently_swallowed(
        self,
        db: AsyncSession,
        pending_lineup: Lineup,
    ):
        """The former `except (TypeError, ValueError): pass` silent swallow is
        now a structured log + structured code (matches this file's exemplary
        Anthropic error handling). The call still succeeds, confidence is None."""
        from app.services.classification.classifier_service import classify_lineup

        classifier_output = {
            "game_slug": "valorant",
            "map_slug": "bind",
            "target_zone_slug": None,
            "stand_zone_slug": None,
            "side": None,
            "utility_type_slug": None,
            "aim_anchor_x": None,
            "aim_anchor_y": None,
            "confidence": "very high",  # non-numeric — must NOT be swallowed
            "reasoning": "Unsure.",
        }

        with (
            patch(
                "app.services.classification.classifier_service._fetch_screenshot_bytes",
                return_value=_FAKE_PNG,
            ),
            patch("app.services.classification.classifier_service.settings") as mock_settings,
            patch("app.services.classification.classifier_service.anthropic.Anthropic") as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_client.messages.create.return_value = _make_anthropic_response(
                classifier_output
            )

            result = await classify_lineup(db, pending_lineup.id)

        assert result.success is True
        assert result.confidence is None  # dropped, but not silently
        assert any(
            c == "invalid_confidence:very high"
            for c in result.classification_failures
        ), result.classification_failures
        assert "invalid confidence" in result.reasoning
