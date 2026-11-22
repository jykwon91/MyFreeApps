"""Limits on POST /recipes/extract: the byte cap, the pixel cap, and off-loop processing."""
from __future__ import annotations

import io
import os
import threading

import pytest
from PIL import Image, JpegImagePlugin
from starlette.datastructures import UploadFile

from app.core.config import settings
from app.core.photo_import_constants import MAX_PHOTO_PIXELS
from app.services.recipe import photo_extraction_service as pes
from platform_shared.core.capped_upload_constants import UPLOAD_READ_CHUNK_BYTES
from platform_shared.core.image_pixel_limit_error import ImagePixelLimitError
from recipe_photo_helpers import GOOD_RECIPE, mock_extraction, photo_files, png_declaring


class TestExtractLimits:
    @pytest.mark.asyncio
    async def test_oversize_is_refused_without_reading_the_whole_file(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """The cap is checked while reading, so a huge upload is never pulled into memory whole."""
        mock_extraction(monkeypatch)
        cap = 1024 * 1024
        monkeypatch.setattr(settings, "max_photo_upload_bytes", cap)
        read_sizes: list[int] = []
        returned: list[int] = []
        original_read = UploadFile.read

        async def recording_read(self: UploadFile, size: int = -1) -> bytes:
            read_sizes.append(size)
            chunk = await original_read(self, size)
            returned.append(len(chunk))
            return chunk

        monkeypatch.setattr(UploadFile, "read", recording_read)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/recipes/extract", files=photo_files(content=b"\x89PNG" + b"\0" * (cap * 8))
            )
        assert resp.status_code == 413
        assert resp.json()["detail"] == "Image exceeds the 1 MB limit."
        assert read_sizes and all(size > 0 for size in read_sizes)  # never "read everything"
        assert sum(returned) <= cap + UPLOAD_READ_CHUNK_BYTES

    @pytest.mark.asyncio
    async def test_large_normal_photo_is_read_in_full(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """A photo spanning several read chunks arrives intact and still extracts."""
        mock_extraction(monkeypatch, data=GOOD_RECIPE)
        noisy = Image.frombytes("RGB", (1200, 1200), os.urandom(1200 * 1200 * 3))
        buf = io.BytesIO()
        noisy.save(buf, format="PNG")
        assert len(buf.getvalue()) > 3 * 1024 * 1024
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files(content=buf.getvalue()))
        assert resp.status_code == 200, resp.text
        assert resp.json()["title"] == "Lemon Butter Chicken"

    @pytest.mark.asyncio
    async def test_pixel_bomb_returns_413(self, user_factory, as_user, monkeypatch) -> None:
        mock_extraction(monkeypatch, data=GOOD_RECIPE)
        bomb = png_declaring(20_000, 20_000)
        assert len(bomb) < 1024
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files(content=bomb))
        assert resp.status_code == 413, resp.text
        assert resp.json()["detail"] == "Image exceeds the 80 megapixel limit."

    @pytest.mark.asyncio
    async def test_image_is_processed_off_the_event_loop(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        mock_extraction(monkeypatch, data=GOOD_RECIPE)
        threads: list[threading.Thread] = []
        original = pes._normalize_image

        def recording_normalize(file_bytes: bytes) -> bytes:
            threads.append(threading.current_thread())
            return original(file_bytes)

        monkeypatch.setattr(pes, "_normalize_image", recording_normalize)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/recipes/extract", files=photo_files())
        assert resp.status_code == 200, resp.text
        assert threads and threads[0] is not threading.main_thread()


class TestPixelCapBeforeDecoding:
    def test_header_over_pixel_cap_is_refused_before_decoding(self) -> None:
        with pytest.raises(ImagePixelLimitError):
            pes._normalize_image(png_declaring(MAX_PHOTO_PIXELS // 1000 + 1, 1000))

    def test_large_jpeg_is_decoded_at_a_reduced_scale(self, monkeypatch) -> None:
        """A big JPEG is drafted near the target size, not decoded in full and then shrunk."""
        drafts: list[tuple[str | None, tuple[int, int] | None]] = []
        original_draft = JpegImagePlugin.JpegImageFile.draft

        def recording_draft(self, mode, size):
            drafts.append((mode, size))
            return original_draft(self, mode, size)

        monkeypatch.setattr(JpegImagePlugin.JpegImageFile, "draft", recording_draft)
        buf = io.BytesIO()
        Image.new("RGB", (3200, 2400), "white").save(buf, format="JPEG")

        result = Image.open(io.BytesIO(pes._normalize_image(buf.getvalue())))

        assert drafts[0] == ("RGB", (pes._MAX_EDGE_PX, pes._MAX_EDGE_PX))
        assert result.format == "JPEG"
        assert result.size == (pes._MAX_EDGE_PX, pes._MAX_EDGE_PX * 3 // 4)
