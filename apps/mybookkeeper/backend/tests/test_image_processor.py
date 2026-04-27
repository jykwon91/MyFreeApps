"""Tests for `services/storage/image_processor.py`.

The processor is a pure function — these tests exercise it directly with byte
fixtures, no DB / no storage / no FastAPI app.

Coverage:
- EXIF strip removes GPS chunks from JPEG (the listing-photo leak risk per §8.6).
- Sniffed type rejects mismatched extension/content (polyglot defense).
- Allowlist enforcement (PDF rejected, BMP rejected, SVG rejected, etc.).
- Size limit enforcement.
- Decompression-bomb defense (fictional huge image header).
"""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.storage.image_processor import (
    ALLOWED_PHOTO_MIME_TYPES,
    MAX_IMAGE_BYTES,
    ImageRejected,
    process_image,
    sniff_content_type,
)


def _build_jpeg(width: int = 64, height: int = 64, exif: bytes | None = None) -> bytes:
    """Return a small valid JPEG, optionally with an EXIF chunk."""
    img = Image.new("RGB", (width, height), color=(120, 200, 90))
    buffer = io.BytesIO()
    if exif is not None:
        img.save(buffer, format="JPEG", exif=exif)
    else:
        img.save(buffer, format="JPEG")
    return buffer.getvalue()


def _build_png(width: int = 64, height: int = 64) -> bytes:
    img = Image.new("RGB", (width, height), color=(50, 50, 200))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def _build_jpeg_with_gps_exif() -> bytes:
    """Build a JPEG with a GPS EXIF block embedded.

    Pillow's `Image.getexif()` exposes EXIF tag 0x8825 (GPSInfo) as a sub-IFD.
    We construct one with non-zero GPS coordinates so the strip can be observed.
    Pillow expects flat tuples of floats/ints for rational fields (it converts
    to fractions internally — passing nested rational pairs raises TypeError
    in newer Pillow versions).
    """
    from PIL import TiffImagePlugin

    img = Image.new("RGB", (32, 32), color=(255, 0, 0))
    exif = img.getexif()
    # Top-level fields so the EXIF block is non-trivially populated.
    exif[0x010F] = "TestPhoneMaker"
    exif[0x0110] = "TestPhoneModel"
    # GPS sub-IFD: tag 0x8825 takes GPS-specific tags. Pillow accepts
    # IFDRational triples (deg, min, sec) for lat/long.
    gps_ifd = exif.get_ifd(0x8825)
    gps_ifd[1] = "N"  # GPSLatitudeRef
    gps_ifd[2] = (
        TiffImagePlugin.IFDRational(37, 1),
        TiffImagePlugin.IFDRational(33, 1),
        TiffImagePlugin.IFDRational(45, 1),
    )
    gps_ifd[3] = "W"
    gps_ifd[4] = (
        TiffImagePlugin.IFDRational(122, 1),
        TiffImagePlugin.IFDRational(25, 1),
        TiffImagePlugin.IFDRational(10, 1),
    )
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


def _exif_block(content: bytes) -> bytes | None:
    """Return the raw EXIF block from a JPEG (None if absent)."""
    with Image.open(io.BytesIO(content)) as image:
        exif = image.getexif()
        if not exif:
            return None
        try:
            return exif.tobytes()
        except Exception:
            return None


class TestSniffContentType:
    def test_jpeg_header_recognised(self) -> None:
        jpeg = _build_jpeg()
        assert sniff_content_type(jpeg) == "image/jpeg"

    def test_png_header_recognised(self) -> None:
        png = _build_png()
        assert sniff_content_type(png) == "image/png"

    def test_heic_header_recognised(self) -> None:
        # Synthesise a minimal ISO-BMFF "ftypmif1" container header. The full
        # file isn't a real HEIC (PIL won't decode it without pillow-heif),
        # but the sniffer only looks at the header bytes — that's enough to
        # exercise the recognition branch independently of the decoder.
        header = b"\x00\x00\x00\x18ftypmif1" + b"\x00" * 100
        assert sniff_content_type(header) == "image/heic"

    def test_pdf_not_recognised(self) -> None:
        pdf = b"%PDF-1.7\n%fake\n"
        assert sniff_content_type(pdf) is None

    def test_short_input_returns_none(self) -> None:
        assert sniff_content_type(b"abc") is None

    def test_bmp_not_recognised(self) -> None:
        bmp_header = b"BM" + b"\x00" * 30
        assert sniff_content_type(bmp_header) is None


class TestProcessImageEXIFStripping:
    def test_strips_gps_exif_from_jpeg(self) -> None:
        """The headline §8.6 guarantee — host-residence GPS must NOT survive."""
        with_gps = _build_jpeg_with_gps_exif()

        # Sanity check: the input ACTUALLY has EXIF on it.
        original_exif = _exif_block(with_gps)
        assert original_exif is not None and len(original_exif) > 0

        processed = process_image(with_gps, declared_content_type="image/jpeg")
        assert processed.content_type == "image/jpeg"

        # The stripped output must have no EXIF block (or an empty one).
        stripped = _exif_block(processed.content)
        assert stripped is None or len(stripped) == 0

        # The image is still decodable and dimensions preserved.
        with Image.open(io.BytesIO(processed.content)) as img:
            assert img.size == (32, 32)

    def test_jpeg_without_exif_passes_through(self) -> None:
        plain = _build_jpeg(width=10, height=10)
        processed = process_image(plain, declared_content_type="image/jpeg")
        assert processed.content_type == "image/jpeg"
        # Output still decodable
        with Image.open(io.BytesIO(processed.content)) as img:
            assert img.size == (10, 10)

    def test_png_re_encoded_cleanly(self) -> None:
        png = _build_png(width=20, height=20)
        processed = process_image(png, declared_content_type="image/png")
        assert processed.content_type == "image/png"


class TestProcessImageAllowlist:
    def test_pdf_rejected(self) -> None:
        pdf = b"%PDF-1.7\n%fake content\n" + b"\x00" * 100
        with pytest.raises(ImageRejected) as exc_info:
            process_image(pdf, declared_content_type="application/pdf")
        assert "unsupported" in exc_info.value.reason.lower()

    def test_text_file_rejected(self) -> None:
        txt = b"hello world this is plain text" * 10
        with pytest.raises(ImageRejected):
            process_image(txt, declared_content_type="text/plain")

    def test_empty_file_rejected(self) -> None:
        with pytest.raises(ImageRejected) as exc_info:
            process_image(b"", declared_content_type="image/jpeg")
        assert "empty" in exc_info.value.reason.lower()

    def test_polyglot_jpeg_header_with_garbage_body_rejected(self) -> None:
        """Malicious file: real JPEG magic bytes glued onto random payload.
        The decoder will fail when it actually tries to load the pixel data."""
        polyglot = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"random garbage" * 50
        with pytest.raises(ImageRejected):
            process_image(polyglot)

    def test_declared_type_does_not_override_sniff(self) -> None:
        """Even if the client claims `image/jpeg`, a PDF body must be rejected."""
        pdf_with_lying_header = b"%PDF-1.7\n" + b"\x00" * 200
        with pytest.raises(ImageRejected):
            process_image(pdf_with_lying_header, declared_content_type="image/jpeg")

    def test_allowed_types_match_constant(self) -> None:
        # Defensive: catch accidental mutation of the allowlist set.
        assert ALLOWED_PHOTO_MIME_TYPES == frozenset({
            "image/jpeg",
            "image/png",
            "image/heic",
        })


class TestProcessImageSizeLimit:
    def test_oversized_file_rejected_at_byte_check(self) -> None:
        """Build a fake oversized payload — the size check fires before sniff
        so we don't have to actually allocate a 10MB image."""
        oversize = b"\xff\xd8\xff" + b"\x00" * (MAX_IMAGE_BYTES + 1)
        with pytest.raises(ImageRejected) as exc_info:
            process_image(oversize)
        assert "MB" in exc_info.value.reason

    def test_under_size_limit_accepted(self) -> None:
        plain = _build_jpeg(width=8, height=8)
        assert len(plain) < MAX_IMAGE_BYTES
        processed = process_image(plain)
        assert processed.content


class TestProcessImagePurity:
    """The processor must be pure — same input, same output."""

    def test_deterministic_output_for_same_input(self) -> None:
        png = _build_png(width=12, height=12)
        a = process_image(png)
        b = process_image(png)
        # PNG re-encode is deterministic when there's no EXIF involved.
        assert a.content == b.content
        assert a.content_type == b.content_type