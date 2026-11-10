"""The shared stripper removes EXIF, XMP and ICC blocks from every format it re-encodes."""
from __future__ import annotations

import io

import pytest
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from app.services.storage.image_processor import process_image, strip_metadata
from tests.icc_profiles import display_p3_profile

_XMP = (
    b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    b'<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="30,10.5N" '
    b'exif:GPSLongitude="97,44.2W"/></rdf:RDF></x:xmpmeta>'
)
_GPS_IFD = 0x8825
_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "HEIF": "image/heic"}
_LEAK_MARKERS = (b"Exif\x00\x00", b"http://ns.adobe.com/xap/1.0/", b"GPSLatitude", b"GPSLongitude", b"xmpmeta", b"eXIf", b"iCCP", b"ICC_PROFILE")


def _exif_with_gps() -> bytes:
    exif = Image.Exif()
    exif.get_ifd(_GPS_IFD)[1] = "N"
    return exif.tobytes()


def _build(fmt: str, *, icc: bytes | None = None) -> bytes:
    image = Image.new("RGB", (40, 20), (200, 80, 80))
    buf = io.BytesIO()
    kwargs: dict[str, object] = {}
    if icc:
        kwargs["icc_profile"] = icc
    if fmt == "PNG":
        info = PngInfo()
        info.add_itxt("XML:com.adobe.xmp", _XMP.decode())
        image.save(buf, format="PNG", pnginfo=info, exif=_exif_with_gps(), **kwargs)
    else:
        image.save(buf, format=fmt, xmp=_XMP, exif=_exif_with_gps(), **kwargs)
    return buf.getvalue()


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP", "HEIF"])
def test_exif_xmp_and_gps_are_gone_from_the_output_bytes(fmt: str) -> None:
    source = _build(fmt)
    assert b"GPSLatitude" in source, "fixture must carry XMP GPS"

    output = strip_metadata(source, _MIME[fmt]).content

    for marker in _LEAK_MARKERS:
        assert marker not in output, marker
    with Image.open(io.BytesIO(output)) as out:
        assert not out.getexif().get_ifd(_GPS_IFD)
        assert "xmp" not in out.info


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP", "HEIF"])
def test_a_display_p3_photo_becomes_untagged_srgb(fmt: str) -> None:
    source = _build(fmt, icc=display_p3_profile())
    with Image.open(io.BytesIO(source)) as before:
        assert before.info.get("icc_profile"), "fixture must carry a profile"
        before_pixel = before.convert("RGB").getpixel((5, 5))

    output = strip_metadata(source, _MIME[fmt]).content

    with Image.open(io.BytesIO(output)) as out:
        assert "icc_profile" not in out.info
        after_pixel = out.convert("RGB").getpixel((5, 5))
    # Display P3 (200, 80, 80) is a more saturated colour than the same numbers in sRGB.
    assert after_pixel[0] > before_pixel[0] + 8
    assert after_pixel[1] < before_pixel[1] - 3


def test_an_unusable_icc_profile_does_not_reject_the_photo() -> None:
    source = _build("JPEG", icc=b"not an icc profile")

    assert process_image(source).content_type == "image/jpeg"


def test_a_png_with_transparency_keeps_its_alpha() -> None:
    buf = io.BytesIO()
    Image.new("RGBA", (8, 8), (0, 0, 255, 0)).save(buf, format="PNG")

    output = process_image(buf.getvalue())

    with Image.open(io.BytesIO(output.content)) as out:
        assert out.mode == "RGBA"
        assert out.getpixel((1, 1))[3] == 0


def test_a_palette_png_with_transparency_stays_transparent() -> None:
    palette = Image.new("P", (8, 8), 0)
    palette.putpalette([0, 0, 255] * 256)
    buf = io.BytesIO()
    palette.save(buf, format="PNG", transparency=0)

    output = process_image(buf.getvalue())

    with Image.open(io.BytesIO(output.content)) as out:
        assert out.convert("RGBA").getpixel((1, 1))[3] == 0
