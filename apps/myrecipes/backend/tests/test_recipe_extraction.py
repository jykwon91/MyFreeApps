"""Tests for photo->recipe extraction (POST /recipes/extract).

The shared Anthropic call is mocked (no network, no key needed in CI) by
patching the module-level ``ExtractionService`` instance. Image bytes are real
PNGs generated with Pillow so the server-side normalization path actually runs.
Coercion of the model's (untrusted) JSON is exercised both end-to-end and as a
focused unit test.
"""
from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.config import settings
from app.services.recipe import photo_extraction_service as pes
from platform_shared.extraction import (
    ExtractionError,
    ExtractionParseError,
    ExtractionResponse,
)

_GOOD_RECIPE = {
    "title": "Lemon Butter Chicken",
    "description": "A quick weeknight dinner.",
    "source": "Julia Child",
    "servings": "4",
    "prep_minutes": 10,
    "cook_minutes": 25,
    "ingredients": [
        {"name": "all-purpose flour", "quantity": "1 1/2", "unit": "cups", "note": "sifted"},
        {"name": "eggs", "quantity": 3, "unit": None, "note": None},
        {"name": "", "quantity": None, "unit": None, "note": "For the sauce:"},
        {"name": "salt", "quantity": "to taste", "unit": None, "note": "to taste", "confidence": "x"},
    ],
    "steps": [{"instruction": "Season chicken."}, {"instruction": "   "}, "Cook through."],
}


def _image_bytes(fmt: str = "PNG", size: tuple[int, int] = (48, 48)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "white").save(buf, format=fmt)
    return buf.getvalue()


class _FakeExtraction:
    """Stand-in for the shared ExtractionService — no network, no API key."""

    def __init__(self, configured: bool, data: dict | None, raises: Exception | None) -> None:
        self._configured = configured
        self._data = data
        self._raises = raises

    def is_configured(self) -> bool:
        return self._configured

    async def extract_document(self, prompt, file_bytes, media_type, **kwargs):
        if self._raises is not None:
            raise self._raises
        return ExtractionResponse(
            data=self._data if self._data is not None else _GOOD_RECIPE,
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
            model=pes._MODEL,
        )


def _mock_extraction(
    monkeypatch: pytest.MonkeyPatch,
    *,
    configured: bool = True,
    data: dict | None = None,
    raises: Exception | None = None,
) -> None:
    """Replace the module-level ExtractionService so no real API call happens."""
    monkeypatch.setattr(pes, "_extraction", _FakeExtraction(configured, data, raises))


def _files(name: str = "recipe.png", content: bytes | None = None, ctype: str = "image/png"):
    return {"file": (name, content if content is not None else _image_bytes(), ctype)}


class TestExtractRecipePhoto:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/recipes/extract", files=_files())
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_happy_path_returns_coerced_draft(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        _mock_extraction(monkeypatch, data=_GOOD_RECIPE)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files())

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
        _mock_extraction(monkeypatch, configured=False)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files())
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_unsupported_type_returns_415(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes/extract", files=_files(name="r.txt", content=b"hello", ctype="text/plain")
            )
        assert resp.status_code == 415

    @pytest.mark.asyncio
    async def test_empty_file_returns_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files(content=b""))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_oversize_returns_413(self, user_factory, as_user, monkeypatch) -> None:
        monkeypatch.setattr(settings, "max_photo_upload_bytes", 10)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files())  # a real PNG > 10 bytes
        assert resp.status_code == 413

    @pytest.mark.asyncio
    async def test_undecodable_image_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        # Declared image/png but the bytes aren't a real image -> PIL fails to
        # decode -> 422 (the extraction call is never reached).
        _mock_extraction(monkeypatch)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes/extract", files=_files(content=b"definitely-not-an-image")
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_parse_error_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        _mock_extraction(monkeypatch, raises=ExtractionParseError("not json"))
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files())
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_api_error_returns_503(self, user_factory, as_user, monkeypatch) -> None:
        _mock_extraction(
            monkeypatch,
            raises=ExtractionError("overloaded", error_type="overloaded_error", status=529),
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files())
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_no_recipe_found_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        # The model's documented "nothing readable" all-empty response.
        _mock_extraction(
            monkeypatch,
            data={"title": "", "ingredients": [], "steps": []},
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=_files())
        assert resp.status_code == 422


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
