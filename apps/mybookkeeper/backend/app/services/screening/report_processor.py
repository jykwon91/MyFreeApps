"""Pure-function safety pipeline for screening report uploads.

Per RENTALS_PLAN.md §8.5 (Phase 3 PR 3.3, KeyCheck redirect-only):

    size check → content-type sniff (python-magic) → allowlist
        → ClamAV scan (graceful degradation when unavailable)
        → if image: Pillow EXIF strip (defensive — KeyCheck reports are
          PDFs, but a host could mistakenly upload a screenshot)

This module is pure — no I/O, no DB, no network beyond the optional ClamAV
unix-socket scan. The caller (route or service) runs the byte stream
through ``process_report`` before persisting.

Dependencies:
- ``python-magic`` for content-type sniffing. When libmagic is unavailable
  on the dev/test machine, falls back to a header-bytes sniff so unit
  tests still run.
- ``clamd`` for the ClamAV unix-socket scan. The scan is skipped (with a
  WARNING log) when ``CLAMAV_SOCKET_PATH`` is not set or the socket is
  unreachable — the operator is expected to wire ClamAV up in production.
- ``Pillow`` for the EXIF strip on image uploads. Already imported through
  ``services/storage/image_processor.py``.
"""
from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from typing import TYPE_CHECKING

from PIL import Image, UnidentifiedImageError

if TYPE_CHECKING:  # pragma: no cover — types-only
    pass

logger = logging.getLogger(__name__)


ALLOWED_REPORT_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
})

# 10 MB cap — matches photo uploads (RENTALS_PLAN.md §8.5). Operator can
# bump via ``MAX_SCREENING_REPORT_BYTES`` env var if KeyCheck ever ships a
# large multi-page PDF that exceeds the cap.
DEFAULT_MAX_REPORT_BYTES: int = 10 * 1024 * 1024
# Pixel cap on image uploads — same defense against decompression bombs as
# image_processor.py.
MAX_IMAGE_PIXELS: int = 12_000 * 12_000


def _max_bytes() -> int:
    raw = os.environ.get("MAX_SCREENING_REPORT_BYTES", "").strip()
    if not raw:
        return DEFAULT_MAX_REPORT_BYTES
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "Invalid MAX_SCREENING_REPORT_BYTES=%r, falling back to default", raw,
        )
        return DEFAULT_MAX_REPORT_BYTES


class ReportRejected(ValueError):
    """Raised when an uploaded report fails any safety check.

    The route handler maps to:
    - HTTP 413 when ``reason`` starts with "file exceeds"
    - HTTP 415 otherwise (unsupported / invalid content)
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class ProcessedReport:
    """Result of ``process_report`` — bytes are safe to persist."""

    content: bytes
    content_type: str


# --------------------------------------------------------------------------- #
# Content-type sniffing
# --------------------------------------------------------------------------- #

def _sniff_with_magic(content: bytes) -> str | None:
    """Use python-magic when libmagic is available. Returns None on import
    or runtime error so the caller can fall back to a header sniff.

    The ``MAGIC_DISABLED`` env var explicitly disables the libmagic path —
    used by the test suite (libmagic crashes the Windows test interpreter
    when the libmagic-bin DLL isn't on the system) and by ops in
    environments where libmagic isn't deployed alongside the venv. The
    header-bytes fallback covers the allowlisted MIME types either way.
    """
    if os.environ.get("MAGIC_DISABLED", "").strip().lower() in {"1", "true", "yes"}:
        return None
    try:
        import magic  # type: ignore[import-not-found]
    except ImportError:
        return None
    except Exception:  # noqa: BLE001 — libmagic DLL load can crash on Windows
        logger.warning("libmagic import failed, falling back to header sniff", exc_info=True)
        return None
    try:
        sniffed = magic.from_buffer(content, mime=True)
    except Exception:  # noqa: BLE001 — libmagic can raise OSError on Windows
        logger.warning("libmagic sniff failed, falling back to header sniff", exc_info=True)
        return None
    return sniffed


def _sniff_header(content: bytes) -> str | None:
    """Header-bytes fallback covering the allowlisted formats only."""
    if len(content) < 8:
        return None
    if content[:4] == b"%PDF":
        return "application/pdf"
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return None


def sniff_content_type(content: bytes) -> str | None:
    """Return the sniffed MIME type, or None if unrecognised.

    Prefers python-magic when libmagic is installed; otherwise uses a
    header-bytes sniff covering exactly the allowlisted formats. Kept
    separate so unit tests can exercise the fallback path explicitly.
    """
    sniffed = _sniff_with_magic(content)
    if sniffed is not None and sniffed != "application/octet-stream":
        return sniffed
    return _sniff_header(content)


# --------------------------------------------------------------------------- #
# ClamAV scan — graceful degradation
# --------------------------------------------------------------------------- #

class VirusFound(ReportRejected):
    """Distinct subclass so tests can assert on the exact rejection reason."""


def _clamav_scan(content: bytes) -> None:
    """Scan ``content`` via ClamAV; raise ``VirusFound`` on infection.

    Returns silently (with a WARNING log) when ClamAV is not configured or
    not reachable. Operators wire ClamAV up in production; dev/test/CI run
    without it.
    """
    socket_path = os.environ.get("CLAMAV_SOCKET_PATH", "").strip()
    if not socket_path:
        logger.debug("ClamAV not configured (CLAMAV_SOCKET_PATH unset) — skipping scan")
        return
    try:
        import clamd  # type: ignore[import-not-found]
    except ImportError:
        logger.warning("clamd library not installed — skipping virus scan")
        return
    try:
        client = clamd.ClamdUnixSocket(path=socket_path)
        result = client.instream(io.BytesIO(content))
    except Exception:  # noqa: BLE001 — clamd raises a wide variety
        logger.warning(
            "ClamAV scan failed at socket=%s — skipping (fail-open)",
            socket_path,
            exc_info=True,
        )
        return
    # clamd returns {'stream': ('FOUND', 'EICAR-Test-Signature')} on hit
    # or {'stream': ('OK', None)} on clean.
    stream = result.get("stream") if isinstance(result, dict) else None
    if not stream:
        return
    verdict, signature = stream[0], stream[1] if len(stream) > 1 else None
    if verdict == "FOUND":
        raise VirusFound(f"file rejected: virus signature {signature!r}")


# --------------------------------------------------------------------------- #
# Pillow EXIF strip (image uploads only)
# --------------------------------------------------------------------------- #

_PIL_FORMAT_TO_MIME: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
}
_MIME_TO_PIL_FORMAT: dict[str, str] = {v: k for k, v in _PIL_FORMAT_TO_MIME.items()}


def _strip_image_metadata(content: bytes, mime: str) -> bytes:
    """Re-encode the image so EXIF / XMP / ICC chunks are dropped.

    Defensive — KeyCheck reports are PDFs and rarely image uploads, but a
    host can paste a screenshot of the report and we should never persist
    GPS coordinates from a phone screenshot.
    """
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            pixel_count = image.width * image.height
            if pixel_count > MAX_IMAGE_PIXELS:
                raise ReportRejected(
                    f"image dimensions exceed {MAX_IMAGE_PIXELS} pixels",
                )
            pil_format = (image.format or "").upper()
            expected = _MIME_TO_PIL_FORMAT.get(mime)
            if expected is None or pil_format != expected:
                raise ReportRejected(
                    f"sniffed MIME does not match decoded format "
                    f"(sniffed={mime!r}, decoded={pil_format!r})",
                )
            buffer = io.BytesIO()
            save_kwargs: dict[str, object] = {"format": pil_format}
            if pil_format == "JPEG":
                save_kwargs["quality"] = 90
                save_kwargs["optimize"] = True
                save_kwargs["exif"] = b""
            image.save(buffer, **save_kwargs)
            return buffer.getvalue()
    except UnidentifiedImageError as exc:
        raise ReportRejected(f"cannot decode image: {exc}") from exc
    except ReportRejected:
        raise
    except Exception as exc:  # noqa: BLE001 — PIL throws a wide variety
        raise ReportRejected(f"image processing failed: {exc}") from exc


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #

def process_report(
    content: bytes,
    declared_content_type: str | None = None,
) -> ProcessedReport:
    """Validate, sniff, virus-scan, and (for images) EXIF-strip an upload.

    Args:
        content: Raw bytes from the multipart request.
        declared_content_type: Optional Content-Type header — used only as
            a sanity check; the sniffed type wins on disagreement.

    Returns:
        ProcessedReport with the cleaned bytes and canonical MIME type.

    Raises:
        ReportRejected: on size, format, decode, or virus check failure.
    """
    if not content:
        raise ReportRejected("empty file")
    cap = _max_bytes()
    if len(content) > cap:
        raise ReportRejected(f"file exceeds {cap // (1024 * 1024)}MB limit")

    sniffed = sniff_content_type(content)
    if sniffed is None or sniffed not in ALLOWED_REPORT_MIME_TYPES:
        raise ReportRejected(
            f"unsupported file type (sniffed={sniffed!r}, "
            f"declared={declared_content_type!r})",
        )

    _clamav_scan(content)

    # PDFs are persisted as-is — no in-process re-encoding for PDFs.
    if sniffed == "application/pdf":
        return ProcessedReport(content=content, content_type=sniffed)

    # Image upload — strip EXIF / metadata via Pillow re-encode.
    cleaned = _strip_image_metadata(content, sniffed)
    return ProcessedReport(content=cleaned, content_type=sniffed)
