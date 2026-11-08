"""strip_metadata keeps real phone photos usable after removing their metadata."""
from __future__ import annotations

import io

import pytest
from PIL import Image, ImageFile, TiffImagePlugin

from app.services.storage.image_processor import ImageRejected, strip_metadata
from tests.gps_photo import GPS_IFD, gps_of

ORIENTATION = 0x0112


def _gps_exif(img: Image.Image) -> Image.Exif:
    exif = img.getexif()
    gps = exif.get_ifd(GPS_IFD)
    gps[1] = "N"
    gps[2] = tuple(TiffImagePlugin.IFDRational(v, 1) for v in (37, 33, 45))
    return exif


def test_a_multi_image_jpeg_is_kept_as_a_single_jpeg_without_gps() -> None:
    # Phones store a depth or HDR gain map as a second image; Pillow opens these as MPO.
    main = Image.new("RGB", (40, 20), (255, 0, 0))
    buf = io.BytesIO()
    main.save(buf, format="MPO", save_all=True, append_images=[Image.new("RGB", (10, 10))], exif=_gps_exif(main).tobytes())
    with Image.open(io.BytesIO(buf.getvalue())) as before:
        assert before.format == "MPO"
        assert before.n_frames == 2
    assert gps_of(buf.getvalue()), "fixture must carry GPS"

    stripped = strip_metadata(buf.getvalue(), "image/jpeg")

    with Image.open(io.BytesIO(stripped)) as after:
        assert after.format == "JPEG"
        assert after.size == (40, 20)
    assert gps_of(stripped) == {}


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_a_rotated_photo_is_stored_upright(fmt: str) -> None:
    # Orientation 6: the camera saved the pixels sideways and asks viewers to turn them 90°.
    img = Image.new("RGB", (40, 20), (0, 0, 255))
    exif = _gps_exif(img)
    exif[ORIENTATION] = 6
    buf = io.BytesIO()
    img.save(buf, format=fmt, exif=exif.tobytes())
    assert gps_of(buf.getvalue()), "fixture must carry GPS"

    stripped = strip_metadata(buf.getvalue(), f"image/{fmt.lower()}")

    with Image.open(io.BytesIO(stripped)) as after:
        assert after.size == (20, 40)
        assert ORIENTATION not in after.getexif()
    assert gps_of(stripped) == {}


def test_the_pixel_cap_is_checked_before_the_image_is_decoded(monkeypatch: pytest.MonkeyPatch) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (11, 10)).save(buf, format="PNG")
    monkeypatch.setattr("app.services.storage.image_processor.MAX_IMAGE_PIXELS", 100)

    def _no_decode(_self: ImageFile.ImageFile) -> None:
        raise AssertionError("decoded an oversized image")

    monkeypatch.setattr(ImageFile.ImageFile, "load", _no_decode)

    with pytest.raises(ImageRejected, match="dimensions"):
        strip_metadata(buf.getvalue(), "image/png")
