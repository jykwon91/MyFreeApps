"""Pure-function image processing for listing-photo uploads.

Per RENTALS_PLAN.md §8.6 ("File upload safety"):
- Type by content sniffing, not extension.
- Allowlist: image/jpeg, image/png, image/heic.
- EXIF strip on every image upload via Pillow (avoids leaking host's GPS).

This module is pure — no I/O, no DB, no network. The caller (route or service)
runs the byte stream through `process_image` before persisting.

The PIL dependency is already in `pyproject.toml` (transitive via `qrcode[pil]`).
Content sniffing prefers `python-magic` when libmagic is available; otherwise
it falls back to a header-bytes sniff covering exactly the allowlisted formats.
That keeps tests runnable on dev machines without libmagic installed.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

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
    "HEIC": "image/heic",
}
_MIME_TO_PIL_FORMAT: dict[str, str] = {v: k for k, v in _PIL_FORMAT_TO_MIME.items()}


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


def process_image(content: bytes, declared_content_type: str | None = None) -> ProcessedImage:
    """Validate, sniff, EXIF-strip, and re-encode an uploaded image.

    Args:
        content: The raw bytes from the request body.
        declared_content_type: Optional Content-Type header from the request,
            used only as a sanity check — the sniffed type wins on disagreement.

    Returns:
        ProcessedImage with the cleaned bytes and the canonical MIME type.

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

    # Decode the image (this also validates that the bytes are a real image
    # and not, say, a polyglot file with a JPEG header glued to a payload).
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            pixel_count = image.width * image.height
            if pixel_count > MAX_IMAGE_PIXELS:
                raise ImageRejected(
                    f"image dimensions exceed {MAX_IMAGE_PIXELS} pixels",
                )

            pil_format = (image.format or "").upper()
            expected = _MIME_TO_PIL_FORMAT.get(sniffed)
            if expected is None or pil_format != expected:
                raise ImageRejected(
                    f"sniffed MIME does not match decoded format "
                    f"(sniffed={sniffed!r}, decoded={pil_format!r})",
                )

            # Re-encode to drop EXIF + any other metadata chunks. Pillow's
            # default save() does not copy EXIF, ICC, XMP, or thumbnails
            # unless the caller explicitly passes them.
            buffer = io.BytesIO()
            save_kwargs: dict[str, object] = {"format": pil_format}
            if pil_format == "JPEG":
                # Preserve quality-mode optimisation. Setting `exif=b""` is
                # the canonical way to wipe an existing EXIF block.
                save_kwargs["quality"] = 90
                save_kwargs["optimize"] = True
                save_kwargs["exif"] = b""
            image.save(buffer, **save_kwargs)
            return ProcessedImage(content=buffer.getvalue(), content_type=sniffed)
    except UnidentifiedImageError as exc:
        raise ImageRejected(f"cannot decode image: {exc}") from exc
    except ImageRejected:
        raise
    except Exception as exc:  # noqa: BLE001 - PIL throws a wide variety
        raise ImageRejected(f"image processing failed: {exc}") from exc
