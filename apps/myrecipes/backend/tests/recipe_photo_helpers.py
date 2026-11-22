"""Shared fixtures for the POST /recipes/extract tests: real image bytes and a fake extractor."""
from __future__ import annotations

import io
import struct
import zlib

import pytest
from PIL import Image

from app.services.recipe import photo_extraction_service as pes
from platform_shared.extraction import ExtractionResponse

GOOD_RECIPE = {
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


def image_bytes(fmt: str = "PNG", size: tuple[int, int] = (48, 48)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "white").save(buf, format=fmt)
    return buf.getvalue()


def png_declaring(width: int, height: int) -> bytes:
    """A tiny PNG whose header claims ``width`` x ``height`` (a decompression bomb)."""
    raw = bytearray(image_bytes("PNG", (1, 1)))
    ihdr_start = 8 + 4  # signature, then the IHDR chunk's length field
    body = bytearray(raw[ihdr_start : ihdr_start + 4 + 13])  # type + data
    body[4:12] = struct.pack(">II", width, height)
    raw[ihdr_start : ihdr_start + 4 + 13] = body
    raw[ihdr_start + 17 : ihdr_start + 21] = struct.pack(">I", zlib.crc32(bytes(body)))
    return bytes(raw)


class FakeExtraction:
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
            data=self._data if self._data is not None else GOOD_RECIPE,
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
            model=pes._MODEL,
        )


def mock_extraction(
    monkeypatch: pytest.MonkeyPatch,
    *,
    configured: bool = True,
    data: dict | None = None,
    raises: Exception | None = None,
) -> None:
    """Replace the module-level ExtractionService so no real API call happens."""
    monkeypatch.setattr(pes, "_extraction", FakeExtraction(configured, data, raises))


def photo_files(name: str = "recipe.png", content: bytes | None = None, ctype: str = "image/png"):
    return {"file": (name, content if content is not None else image_bytes(), ctype)}


