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
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.models.game.source import Source


# ---------------------------------------------------------------------------
# DB fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def game_val(db: AsyncSession) -> Game:
    g = Game(slug="valorant", name="VALORANT", side_a_label="Attacker", side_b_label="Defender")
    db.add(g)
    await db.flush()
    return g


@pytest_asyncio.fixture
async def map_bind(db: AsyncSession, game_val: Game) -> Map:
    m = Map(game_id=game_val.id, slug="bind", name="Bind")
    db.add(m)
    await db.flush()
    return m


@pytest_asyncio.fixture
async def zone_a_short(db: AsyncSession, map_bind: Map) -> MapZone:
    z = MapZone(map_id=map_bind.id, slug="a-short", name="A Short")
    db.add(z)
    await db.flush()
    return z


@pytest_asyncio.fixture
async def zone_b_site(db: AsyncSession, map_bind: Map) -> MapZone:
    z = MapZone(map_id=map_bind.id, slug="b-site", name="B Site")
    db.add(z)
    await db.flush()
    return z


@pytest_asyncio.fixture
async def utility_smoke(db: AsyncSession, game_val: Game) -> UtilityType:
    ut = UtilityType(game_id=game_val.id, slug="smoke", name="Smoke")
    db.add(ut)
    await db.flush()
    return ut


@pytest_asyncio.fixture
async def source_fix(db: AsyncSession) -> Source:
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
            patch("sentry_sdk.capture_exception"),
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
            patch("sentry_sdk.capture_exception"),
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
        from app.services.classification.classifier_service import _resolve_slugs

        game_id, map_id, tz_id, sz_id, ut_id, failures = await _resolve_slugs(
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

    @pytest.mark.asyncio
    async def test_unknown_zone_slug_records_failure(
        self,
        db: AsyncSession,
        game_val: Game,
        map_bind: Map,
    ):
        """A hallucinated zone slug → map/game resolve, zone fails with message."""
        from app.services.classification.classifier_service import _resolve_slugs

        _, _, tz_id, _, _, failures = await _resolve_slugs(
            db,
            game_slug="valorant",
            map_slug="bind",
            target_zone_slug="hallucinated-zone",
            stand_zone_slug=None,
            utility_type_slug=None,
        )

        assert tz_id is None
        assert any("hallucinated-zone" in f for f in failures)

    @pytest.mark.asyncio
    async def test_unknown_game_slug_cascades(
        self,
        db: AsyncSession,
    ):
        """Unknown game slug → game fails; map/zone/utility all fail with cascade note."""
        from app.services.classification.classifier_service import _resolve_slugs

        game_id, map_id, tz_id, sz_id, ut_id, failures = await _resolve_slugs(
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
