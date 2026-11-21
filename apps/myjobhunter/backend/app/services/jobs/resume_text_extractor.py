"""Extract plain text from resume files (PDF / DOCX / TXT).

Returns ``(text, char_count)`` on success. Raises ``ResumeTextExtractionFailed``
when no readable text can be pulled from the file (e.g. a scanned/image-only PDF).
"""
from __future__ import annotations

import logging

from platform_shared.extraction.files import (
    LEGACY_DOC_MESSAGE,
    extract_text_from_docx,
    extract_text_from_pdf,
)

logger = logging.getLogger(__name__)


class ResumeTextExtractionFailed(Exception):
    """Raised when a file yields no extractable text."""


async def extract_text(content_bytes: bytes, content_type: str) -> tuple[str, int]:
    """Extract plain text from ``content_bytes``.

    PDF and DOCX parsing is CPU-bound and runs in a worker thread (via the
    shared extraction helpers), so a large resume doesn't freeze the worker's
    event loop.

    Args:
        content_bytes: Raw file bytes downloaded from MinIO.
        content_type: MIME type of the file (determines extraction strategy).

    Returns:
        ``(text, char_count)`` — the extracted text and its character count.

    Raises:
        ResumeTextExtractionFailed: when the file contains no extractable text
            (e.g. an image-only scanned PDF).
    """
    if content_type == "application/pdf":
        return _non_empty(
            await extract_text_from_pdf(content_bytes),
            "no extractable text — the PDF may be image-only or scanned",
        )
    if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _non_empty(
            await extract_text_from_docx(content_bytes),
            "no extractable text — the DOCX appears to contain only images",
        )
    if content_type == "application/msword":
        # A legacy .doc is not a DOCX zip; the DOCX reader would only report it unreadable.
        raise ResumeTextExtractionFailed(LEGACY_DOC_MESSAGE)
    if content_type == "text/plain":
        return _extract_text_plain(content_bytes)

    # Fallback: try plain-text decode for unknown types.
    logger.warning("Unknown content_type %r — trying plain-text decode", content_type)
    return _extract_text_plain(content_bytes)


def _non_empty(text: str | None, empty_message: str) -> tuple[str, int]:
    if not text:
        raise ResumeTextExtractionFailed(empty_message)
    return text, len(text)


def _extract_text_plain(content_bytes: bytes) -> tuple[str, int]:
    try:
        text = content_bytes.decode("utf-8", errors="replace").strip()
    except Exception as exc:
        raise ResumeTextExtractionFailed(f"failed to decode plain text: {exc}") from exc
    if not text:
        raise ResumeTextExtractionFailed("no extractable text — file is empty")
    return text, len(text)
