"""Tests for photo->recipe extraction (POST /recipes/extract).

The shared Anthropic call is mocked (no network, no key needed in CI) by
patching the module-level ``ExtractionService`` instance. Image bytes are real
PNGs generated with Pillow so the server-side normalization path actually runs.
Coercion of the model's (untrusted) JSON is exercised both end-to-end and as a
focused unit test.
"""
from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock

import anthropic
import httpx2
import pytest
from httpx import AsyncClient
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.rate_limit import discovery_limiter
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from app.services.recipe import photo_extraction_service as pes
from platform_shared.extraction import (
    ExtractionError,
    ExtractionParseError,
    ExtractionService,
)
from recipe_photo_helpers import GOOD_RECIPE, image_bytes, mock_extraction, photo_files

_ANTHROPIC_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _anthropic_status_error(
    cls: type[anthropic.APIStatusError], status: int, error_type: str
) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_ANTHROPIC_REQUEST)
    body = {"type": "error", "error": {"type": error_type, "message": "boom"}}
    return cls("boom", response=response, body=body)


def _real_service_raising(monkeypatch: pytest.MonkeyPatch, exc: Exception) -> None:
    """The real shared ExtractionService, with only the SDK client faked to raise ``exc``."""
    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=exc)
    service = ExtractionService(api_key="sk-ant-test", model=pes._MODEL)
    service._client = client  # the service reuses its cached client
    monkeypatch.setattr(pes, "_extraction", service)


class TestExtractRecipePhoto:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_happy_path_returns_coerced_draft(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        mock_extraction(monkeypatch, data=GOOD_RECIPE)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "Lemon Butter Chicken"
        assert body["servings"] == "4"
        assert body["prep_minutes"] == 10
        assert body["cook_minutes"] == 25
        # "1 1/2" -> 1.5; nameless row dropped; extra "confidence" key ignored.
        assert [i["name"] for i in body["ingredients"]] == [
            "all-purpose flour",
            "eggs",
            "salt",
        ]
        assert body["ingredients"][0]["quantity"] == 1.5
        assert body["ingredients"][2]["quantity"] is None  # "to taste" -> null
        # Blank step dropped; bare-string step accepted.
        assert [s["instruction"] for s in body["steps"]] == ["Season chicken.", "Cook through."]

    @pytest.mark.asyncio
    async def test_not_configured_returns_503(self, user_factory, as_user, monkeypatch) -> None:
        mock_extraction(monkeypatch, configured=False)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_unsupported_type_returns_415(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes/extract", files=photo_files(name="r.txt", content=b"hello", ctype="text/plain")
            )
        assert resp.status_code == 415

    @pytest.mark.asyncio
    async def test_empty_file_returns_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files(content=b""))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_oversize_returns_413(self, user_factory, as_user, monkeypatch) -> None:
        monkeypatch.setattr(settings, "max_photo_upload_bytes", 10)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())  # a real PNG > 10 bytes
        assert resp.status_code == 413

    @pytest.mark.asyncio
    async def test_undecodable_image_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        # Declared image/png but the bytes aren't a real image -> PIL fails to
        # decode -> 422 (the extraction call is never reached).
        mock_extraction(monkeypatch)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes/extract", files=photo_files(content=b"definitely-not-an-image")
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_parse_error_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        mock_extraction(monkeypatch, raises=ExtractionParseError("not json"))
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_reply_cut_off_at_max_tokens_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        # A cut-off reply is never parsed: the JSON scan could pass off a
        # fragment of it as the recipe.
        block = MagicMock(
            type="text",
            text='{"title": "Soup", "steps": [{"title": "Broth", "instruction": "Simmer."}, {"instr',
        )
        message = MagicMock(content=[block], stop_reason="max_tokens")
        message.usage.input_tokens = 10
        message.usage.output_tokens = 4096
        client = MagicMock()
        client.messages.create = AsyncMock(return_value=message)
        service = ExtractionService(api_key="sk-ant-test", model=pes._MODEL)
        service._client = client
        monkeypatch.setattr(pes, "_extraction", service)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_api_error_returns_503(self, user_factory, as_user, monkeypatch) -> None:
        mock_extraction(
            monkeypatch,
            raises=ExtractionError("overloaded", error_type="overloaded_error", status=529),
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 503

    @pytest.mark.parametrize(
        "provider_error",
        [
            anthropic.APITimeoutError(request=_ANTHROPIC_REQUEST),
            anthropic.APIConnectionError(request=_ANTHROPIC_REQUEST),
            _anthropic_status_error(anthropic.InternalServerError, 529, "overloaded_error"),
            _anthropic_status_error(anthropic.AuthenticationError, 401, "authentication_error"),
        ],
    )
    @pytest.mark.asyncio
    async def test_real_service_provider_failure_returns_try_again_later(
        self, user_factory, as_user, monkeypatch, provider_error
    ) -> None:
        """Through the real shared service (only the SDK client is faked)."""
        _real_service_raising(monkeypatch, provider_error)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 503
        assert resp.json()["detail"] == "Photo import is not available right now."

    @pytest.mark.asyncio
    async def test_real_service_rejected_image_returns_422(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        _real_service_raising(
            monkeypatch,
            _anthropic_status_error(anthropic.BadRequestError, 400, "invalid_request_error"),
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_recipe_found_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        # The model's documented "nothing readable" all-empty response.
        mock_extraction(
            monkeypatch,
            data={"title": "", "ingredients": [], "steps": []},
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 422


class TestExtractRateLimit:
    """The throttle is a spend ceiling on a paid vision call, not an auth control."""

    @pytest.mark.asyncio
    async def test_under_budget_passes(self, user_factory, as_user, monkeypatch) -> None:
        mock_extraction(monkeypatch)
        user = await user_factory()
        async with await as_user(user) as authed:
            for _ in range(20):
                assert (await authed.post("/recipes/extract", files=photo_files())).status_code == 200

    @pytest.mark.asyncio
    async def test_over_budget_returns_429_without_calling_extractor(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        mock_extraction(monkeypatch)
        user = await user_factory()
        async with await as_user(user) as authed:
            for _ in range(20):
                assert (await authed.post("/recipes/extract", files=photo_files())).status_code == 200

            async def _boom(*args, **kwargs):
                raise AssertionError("extractor called while rate limited")

            monkeypatch.setattr(pes, "extract_recipe_from_photo", _boom)
            resp = await authed.post("/recipes/extract", files=photo_files())

        assert resp.status_code == 429
        assert resp.json()["detail"] == RATE_LIMIT_GENERIC_DETAIL

    @pytest.mark.asyncio
    async def test_limit_checked_before_body_validation(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """An exhausted budget rejects even an oversize upload with 429, not 413."""
        mock_extraction(monkeypatch)
        user = await user_factory()
        async with await as_user(user) as authed:
            for _ in range(20):
                await authed.post("/recipes/extract", files=photo_files())
            monkeypatch.setattr(settings, "max_photo_upload_bytes", 10)
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 429

    @pytest.mark.asyncio
    async def test_budget_is_isolated_from_discovery(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        mock_extraction(monkeypatch)
        user = await user_factory()
        for _ in range(20):
            discovery_limiter.check(str(user["id"]))
        async with await as_user(user) as authed:
            assert (await authed.post("/recipes/extract", files=photo_files())).status_code == 200

    @pytest.mark.asyncio
    async def test_users_behind_one_ip_get_separate_budgets(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """Many users behind one carrier NAT must not share one budget."""
        mock_extraction(monkeypatch)
        shared_ip = {"X-Forwarded-For": "203.0.113.7"}
        first, second = await user_factory(), await user_factory()
        async with await as_user(first) as authed:
            for _ in range(20):
                await authed.post("/recipes/extract", files=photo_files(), headers=shared_ip)
            assert (
                await authed.post("/recipes/extract", files=photo_files(), headers=shared_ip)
            ).status_code == 429
        async with await as_user(second) as authed:
            assert (
                await authed.post("/recipes/extract", files=photo_files(), headers=shared_ip)
            ).status_code == 200

    @pytest.mark.asyncio
    async def test_rotating_ips_does_not_reset_the_budget(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """One user switching IPs (VPN, mobile handoff) still has one budget."""
        mock_extraction(monkeypatch)
        user = await user_factory()
        async with await as_user(user) as authed:
            for i in range(20):
                resp = await authed.post(
                    "/recipes/extract",
                    files=photo_files(),
                    headers={"X-Forwarded-For": f"198.51.100.{i + 1}"},
                )
                assert resp.status_code == 200
            resp = await authed.post(
                "/recipes/extract",
                files=photo_files(),
                headers={"X-Forwarded-For": "198.51.100.250"},
            )
        assert resp.status_code == 429


class TestPhotoFormats:
    @pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
    def test_supported_formats_become_jpeg(self, fmt: str) -> None:
        result = Image.open(io.BytesIO(pes._normalize_image(image_bytes(fmt))))
        assert result.format == "JPEG"

    def test_multi_frame_phone_jpeg_is_accepted(self) -> None:
        """Many phones save these. Pillow calls them MPO, but reads them through JPEG."""
        buf = io.BytesIO()
        Image.new("RGB", (48, 48), "white").save(
            buf, format="MPO", save_all=True, append_images=[Image.new("RGB", (48, 48), "black")]
        )
        assert Image.open(io.BytesIO(buf.getvalue())).format == "MPO"
        assert Image.open(io.BytesIO(pes._normalize_image(buf.getvalue()))).format == "JPEG"

    @pytest.mark.parametrize("fmt", ["TIFF", "GIF", "BMP"])
    def test_other_formats_are_not_decoded(self, fmt: str) -> None:
        with pytest.raises(UnidentifiedImageError):
            pes._normalize_image(image_bytes(fmt))

    @pytest.mark.asyncio
    async def test_other_format_declared_as_png_returns_422(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        mock_extraction(monkeypatch, data=GOOD_RECIPE)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes/extract", files=photo_files(content=image_bytes("TIFF"), ctype="image/png")
            )
        assert resp.status_code == 422, resp.text


class TestCoerceDraft:
    """Focused unit tests for the defensive coercion of untrusted model JSON."""

    def test_non_dict_yields_empty_draft(self) -> None:
        draft = pes._coerce_draft(["not", "a", "dict"])
        assert draft.title == ""
        assert draft.ingredients == []
        assert draft.steps == []

    def test_quantities_and_minutes_coerced(self) -> None:
        draft = pes._coerce_draft(
            {
                "title": "  Stew  ",
                "prep_minutes": "20 minutes",
                "cook_minutes": -5,  # negative -> dropped
                "ingredients": [
                    {"name": "water", "quantity": "1/2", "unit": "cup"},
                    {"name": "wine", "quantity": "1 3/4", "unit": "cups"},
                    {"name": "pepper", "quantity": "lots", "unit": None},
                ],
                "steps": [],
            }
        )
        assert draft.title == "Stew"
        assert draft.prep_minutes == 20
        assert draft.cook_minutes is None
        assert draft.ingredients[0].quantity == 0.5
        assert draft.ingredients[1].quantity == 1.75
        assert draft.ingredients[2].quantity is None  # unparseable -> null

    def test_long_strings_truncated_and_nameless_dropped(self) -> None:
        draft = pes._coerce_draft(
            {
                "title": "x" * 500,
                "ingredients": [
                    {"name": "", "note": "section header"},
                    {"name": "y" * 500},
                ],
            }
        )
        assert len(draft.title) == 255
        assert len(draft.ingredients) == 1
        assert len(draft.ingredients[0].name) == 255
