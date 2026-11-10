"""Pure-function image processing for listing-photo uploads.

Per RENTALS_PLAN.md §8.6 ("File upload safety"):
- Type by content sniffing, not extension.
- Allowlist: image/jpeg, image/png, image/heic.
- EXIF strip on every image upload via Pillow (avoids leaking host's GPS).
- HEIC is decoded with pillow-heif and stored as JPEG, because browsers cannot
  display HEIC. The returned `content_type` is always the stored format.

This module is pure — no I/O, no DB, no network. The caller (route or service)
runs the byte stream through `process_image` before persisting.

Pillow is a dependency of `qrcode[pil]`; `pillow-heif` adds the HEIC decoder.
Content sniffing prefers `python-magic` when libmagic is available; otherwise
it falls back to a header-bytes sniff covering exactly the allowlisted formats.
That keeps tests runnable on dev machines without libmagic installed.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.services.storage.image_color import flatten_alpha, to_srgb

# Pillow has no HEIC decoder of its own; this registers pillow-heif's opener
# so `Image.open` can read HEIC/HEIF (decoded format name "HEIF").
register_heif_opener()

# Allowlisted MIME types per RENTALS_PLAN.md §8.6. PDFs are explicitly rejected
# for photo uploads — they're documents, not photos, and travel a different
# pipeline (services/documents/document_upload_service.py).
ALLOWED_PHOTO_MIME_TYPES: frozenset[str] = frozenset({
    "image/jpeg",
    "image/png",
    "image/heic",
})

# Hard limits — enforced in the processor on top of the FastAPI body-size cap.
# 10 MB is the size cap for image uploads per §8.6. The pixel cap defends
# against decompression-bomb files (e.g. a 100 KB PNG that decodes to
# 100 000 × 100 000 px and exhausts memory).
MAX_IMAGE_BYTES: int = 10 * 1024 * 1024
MAX_IMAGE_PIXELS: int = 12_000 * 12_000

# PIL formats are not the same as MIME types. Map between them so we can
# re-encode without surprises.
_PIL_FORMAT_TO_MIME: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "HEIF": "image/heic",
    "WEBP": "image/webp",
}
_MIME_TO_PIL_FORMAT: dict[str, str] = {v: k for k, v in _PIL_FORMAT_TO_MIME.items()}

# Formats that are re-encoded as something else on the way out. Browsers cannot
# display HEIC, so it is stored as JPEG.
_OUTPUT_FORMAT: dict[str, str] = {"HEIF": "JPEG"}

_EXTENSION_FOR_MIME: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_FILE_EXTENSION = re.compile(r"\.[A-Za-z0-9]{1,5}$")

# Phones write a second image (depth map, HDR gain map) into many JPEGs, and
# Pillow opens those as MPO. They are still JPEGs; only the main image is kept.
_DECODED_FORMAT_ALIASES: dict[str, str] = {"MPO": "JPEG"}


class ImageRejected(ValueError):
    """Raised when an uploaded image fails any safety check.

    The route handler maps this to HTTP 415 (unsupported media type) or 413
    (payload too large) by inspecting `reason`.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class ProcessedImage:
    """Result of `process_image` — the bytes are safe to persist as-is."""

    content: bytes
    content_type: str


def sniff_content_type(content: bytes) -> str | None:
    """Return the sniffed MIME type, or None if unrecognised.

    Header-byte sniffing covering exactly the allowlisted formats. Kept
    separate from `process_image` so unit tests can exercise it directly.
    """
    if len(content) < 12:
        return None

    # JPEG: starts with FF D8 FF. Any third-byte variant counts.
    if content[0:3] == b"\xff\xd8\xff":
        return "image/jpeg"

    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if content[0:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"

    # HEIC: ISO BMFF container with `ftypheic`/`ftypheix`/`ftyphevc`/`ftypmif1`
    # at offset 4 (the 4-byte size prefix sits at 0..3). MIF1 is the brand
    # most modern iPhones write for HEIC.
    if content[4:8] == b"ftyp":
        brand = content[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"mif1", b"heim", b"heis"):
            return "image/heic"

    return None


def stored_content_type(sniffed: str) -> str:
    """Return the MIME type of the bytes `strip_metadata` writes for `sniffed` input."""
    pil_format = _MIME_TO_PIL_FORMAT[sniffed]
    return _PIL_FORMAT_TO_MIME[_OUTPUT_FORMAT.get(pil_format, pil_format)]


def filename_for_content_type(filename: str, content_type: str) -> str:
    """Give `filename` the extension of the format actually stored.

    Replaces the final extension (appends one when there is none), so a HEIC
    upload stored as JPEG gets a `.jpg` storage key instead of keeping `.heic`.
    """
    extension = _EXTENSION_FOR_MIME.get(content_type)
    if extension is None:
        return filename
    return _FILE_EXTENSION.sub("", filename) + extension


def process_image(content: bytes, declared_content_type: str | None = None) -> ProcessedImage:
    """Validate, sniff, EXIF-strip, and re-encode an uploaded image.

    Args:
        content: The raw bytes from the request body.
        declared_content_type: Optional Content-Type header from the request,
            used only as a sanity check — the sniffed type wins on disagreement.

    Returns:
        ProcessedImage with the cleaned bytes and the MIME type of those
        bytes. HEIC input comes back as image/jpeg.

    Raises:
        ImageRejected: on size, format, or decode failure.
    """
    if not content:
        raise ImageRejected("empty file")
    if len(content) > MAX_IMAGE_BYTES:
        raise ImageRejected(f"file exceeds {MAX_IMAGE_BYTES // (1024 * 1024)}MB limit")

    sniffed = sniff_content_type(content)
    if sniffed is None or sniffed not in ALLOWED_PHOTO_MIME_TYPES:
        raise ImageRejected(
            f"unsupported file type (sniffed={sniffed!r}, declared={declared_content_type!r})",
        )

    return strip_metadata(content, sniffed)


def strip_metadata(content: bytes, content_type: str) -> ProcessedImage:
    """Decode the image and re-encode it without EXIF / GPS / XMP / ICC metadata.

    The output is in the input's format, except HEIC, which is written as JPEG;
    the returned `content_type` is the format of the returned bytes. Colours are
    converted to sRGB and the output carries no profile.

    Raises ImageRejected when the bytes can't be decoded, decode to a different
    format than `content_type`, or exceed the pixel cap — callers must reject the
    upload rather than store the original bytes.
    """
    # Decoding also validates that the bytes are a real image and not, say, a
    # polyglot file with a JPEG header glued to a payload.
    try:
        with Image.open(io.BytesIO(content)) as image:
            # Check the size from the header before decoding, so an oversized
            # image is refused without allocating its pixels.
            pixel_count = image.width * image.height
            if pixel_count > MAX_IMAGE_PIXELS:
                raise ImageRejected(
                    f"image dimensions exceed {MAX_IMAGE_PIXELS} pixels",
                )

            decoded = (image.format or "").upper()
            pil_format = _DECODED_FORMAT_ALIASES.get(decoded, decoded)
            expected = _MIME_TO_PIL_FORMAT.get(content_type)
            if expected is None or pil_format != expected:
                raise ImageRejected(
                    f"sniffed MIME does not match decoded format "
                    f"(sniffed={content_type!r}, decoded={decoded!r})",
                )

            icc_profile = image.info.get("icc_profile")
            image.load()
            # The EXIF block (and its Orientation tag) is dropped below, so
            # rotate the pixels now or a phone photo is stored sideways.
            ImageOps.exif_transpose(image, in_place=True)
            to_srgb(image, icc_profile)

            # Pillow writes EXIF, ICC, XMP and similar blocks from `info` for
            # some formats (PNG iCCP, WebP exif/xmp/icc), so empty it, keeping
            # only the transparency key a palette image needs.
            image.info = {k: v for k, v in image.info.items() if k == "transparency"}

            output_format = _OUTPUT_FORMAT.get(pil_format, pil_format)
            save_kwargs: dict[str, object] = {"format": output_format}
            if output_format == "JPEG":
                image = flatten_alpha(image)
                save_kwargs["quality"] = 90
                save_kwargs["optimize"] = True
                # Setting `exif=b""` is the canonical way to wipe an existing
                # EXIF block.
                save_kwargs["exif"] = b""
            elif output_format == "WEBP":
                save_kwargs["quality"] = 90
            buffer = io.BytesIO()
            image.save(buffer, **save_kwargs)
            return ProcessedImage(
                content=buffer.getvalue(),
                content_type=stored_content_type(content_type),
            )
    except UnidentifiedImageError as exc:
        raise ImageRejected(f"cannot decode image: {exc}") from exc
    except ImageRejected:
        raise
    except Exception as exc:  # noqa: BLE001 - PIL throws a wide variety
        raise ImageRejected(f"image processing failed: {exc}") from exc
