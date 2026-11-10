"""HEIC uploads are decoded with pillow-heif and stored as EXIF-free JPEG.

No test registers the HEIC opener itself: importing the image processor must.
"""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.storage import image_processor
from app.services.storage.image_processor import (
    ImageRejected,
    filename_for_content_type,
    process_image,
    sniff_content_type,
    strip_metadata,
)

_ORIENTATION_TAG = 0x0112
_MARKER = (30, 30, 200)
_BACKGROUND = (200, 30, 30)


def _build_heic(width: int = 40, height: int = 20, exif: bytes | None = None, mode: str = "RGB") -> bytes:
    """A HEIC with a blue 10x10 marker in the top-left corner of a red field."""
    fill = _BACKGROUND + ((255,) if mode == "RGBA" else ())
    image = Image.new(mode, (width, height), fill)
    image.paste(_MARKER + ((255,) if mode == "RGBA" else ()), (0, 0, 10, 10))
    buf = io.BytesIO()
    image.save(buf, format="HEIF", **({"exif": exif} if exif is not None else {}))
    return buf.getvalue()


def _exif_with_orientation(orientation: int) -> bytes:
    exif = Image.Exif()
    exif[_ORIENTATION_TAG] = orientation
    return exif.tobytes()


def _corners_with_marker(content: bytes) -> list[str]:
    with Image.open(io.BytesIO(content)) as image:
        rgb = image.convert("RGB")
        w, h = rgb.size
        corners = {
            "top-left": (2, 2), "top-right": (w - 3, 2),
            "bottom-left": (2, h - 3), "bottom-right": (w - 3, h - 3),
        }
        return [name for name, xy in corners.items() if rgb.getpixel(xy)[2] > 120]


class TestHeicProcessing:
    def test_generated_fixture_is_sniffed_as_heic(self) -> None:
        assert sniff_content_type(_build_heic()) == "image/heic"

    def test_output_is_a_jpeg_and_reports_image_jpeg(self) -> None:
        result = process_image(_build_heic(), declared_content_type="image/heic")

        assert result.content_type == "image/jpeg"
        assert sniff_content_type(result.content) == "image/jpeg"
        with Image.open(io.BytesIO(result.content)) as out:
            assert out.format == "JPEG"
            assert out.size == (40, 20)
        assert _corners_with_marker(result.content) == ["top-left"]

    def test_strip_metadata_reports_the_type_it_wrote(self) -> None:
        result = strip_metadata(_build_heic(), "image/heic")

        assert result.content_type == "image/jpeg"

    @pytest.mark.parametrize(("orientation", "size", "marker_corner"), [
        (1, (40, 20), "top-left"),
        (3, (40, 20), "bottom-right"),
        (6, (20, 40), "top-right"),
        (8, (20, 40), "bottom-left"),
    ])
    def test_rotated_heic_comes_out_upright_without_double_rotation(
        self, orientation: int, size: tuple[int, int], marker_corner: str,
    ) -> None:
        result = process_image(_build_heic(exif=_exif_with_orientation(orientation)))

        with Image.open(io.BytesIO(result.content)) as out:
            assert out.size == size
            assert _ORIENTATION_TAG not in out.getexif()
        assert _corners_with_marker(result.content) == [marker_corner]

    def test_transparent_heic_is_flattened_onto_white(self) -> None:
        image = Image.new("RGBA", (40, 20), (0, 0, 0, 0))
        image.paste((0, 0, 255, 255), (0, 0, 10, 10))
        buf = io.BytesIO()
        image.save(buf, format="HEIF")

        result = process_image(buf.getvalue())

        with Image.open(io.BytesIO(result.content)) as out:
            assert out.mode == "RGB"
            assert min(out.getpixel((35, 15))) > 240

    def test_corrupt_heic_is_rejected(self) -> None:
        corrupt = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200

        with pytest.raises(ImageRejected):
            process_image(corrupt, declared_content_type="image/heic")

    def test_truncated_heic_is_rejected(self) -> None:
        with pytest.raises(ImageRejected):
            process_image(_build_heic()[:60])

    def test_pixel_cap_applies_to_heic(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(image_processor, "MAX_IMAGE_PIXELS", 40 * 20 - 1)

        with pytest.raises(ImageRejected, match="exceed"):
            process_image(_build_heic(40, 20))

    def test_heic_at_the_pixel_cap_is_accepted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(image_processor, "MAX_IMAGE_PIXELS", 40 * 20)

        assert process_image(_build_heic(40, 20)).content_type == "image/jpeg"

    def test_pillows_decompression_bomb_limit_rejects_instead_of_crashing(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Pillow errors above twice its own limit, before our explicit cap runs;
        # that must surface as a rejected upload, not a 500.
        monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 100)

        with pytest.raises(ImageRejected):
            process_image(_build_heic(40, 20))

    def test_jpeg_wearing_a_heic_header_is_rejected(self) -> None:
        buf = io.BytesIO()
        Image.new("RGB", (16, 16)).save(buf, format="JPEG")
        disguised = b"\x00\x00\x00\x18ftypheic" + buf.getvalue()

        with pytest.raises(ImageRejected):
            process_image(disguised)

    def test_jpeg_and_png_keep_their_own_content_type(self) -> None:
        jpeg = io.BytesIO()
        Image.new("RGB", (16, 16)).save(jpeg, format="JPEG")
        png = io.BytesIO()
        Image.new("RGB", (16, 16)).save(png, format="PNG")

        assert process_image(jpeg.getvalue()).content_type == "image/jpeg"
        assert process_image(png.getvalue()).content_type == "image/png"


class TestFilenameForContentType:
    @pytest.mark.parametrize(("name", "content_type", "expected"), [
        ("IMG_1.HEIC", "image/jpeg", "IMG_1.jpg"),
        ("b.heif", "image/jpeg", "b.jpg"),
        ("photo", "image/jpeg", "photo.jpg"),
        ("photo-3f2a", "image/png", "photo-3f2a.png"),
        ("photo.heic.png", "image/png", "photo.heic.png"),
        ("photo.heic.png", "image/jpeg", "photo.heic.jpg"),
        ("shot.jpeg", "image/jpeg", "shot.jpg"),
        ("my.holiday photo", "image/jpeg", "my.holiday photo.jpg"),
    ])
    def test_final_extension_follows_the_stored_type(self, name: str, content_type: str, expected: str) -> None:
        assert filename_for_content_type(name, content_type) == expected
