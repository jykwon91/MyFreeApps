"""Extract plain text from resume files (PDF / DOCX / TXT).

Returns ``(text, char_count)`` on success. Raises ``ResumeTextExtractionFailed``
when no readable text can be pulled from the file (e.g. a scanned/image-only PDF).
"""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


class ResumeTextExtractionFailed(Exception):
    """Raised when a file yields no extractable text."""


def extract_text(content_bytes: bytes, content_type: str) -> tuple[str, int]:
    """Extract plain text from ``content_bytes``.

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
        return _extract_pdf(content_bytes)
    if content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        return _extract_docx(content_bytes)
    if content_type == "text/plain":
        return _extract_text_plain(content_bytes)

    # Fallback: try plain-text decode for unknown types.
    logger.warning("Unknown content_type %r — trying plain-text decode", content_type)
    return _extract_text_plain(content_bytes)


def _extract_pdf(content_bytes: bytes) -> tuple[str, int]:
    import pypdf  # noqa: PLC0415 — lazy import keeps worker startup fast

    reader = pypdf.PdfReader(io.BytesIO(content_bytes))
    pages: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        pages.append(page_text)

    text = "\n".join(pages).strip()
    if not text:
        raise ResumeTextExtractionFailed(
            "no extractable text — the PDF may be image-only or scanned"
        )
    return text, len(text)


def _extract_docx(content_bytes: bytes) -> tuple[str, int]:
    import mammoth  # noqa: PLC0415

    result = mammoth.extract_raw_text(io.BytesIO(content_bytes))
    text = (result.value or "").strip()
    if not text:
        raise ResumeTextExtractionFailed(
            "no extractable text — the DOCX appears to contain only images"
        )
    return text, len(text)


def _extract_text_plain(content_bytes: bytes) -> tuple[str, int]:
    try:
        text = content_bytes.decode("utf-8", errors="replace").strip()
    except Exception as exc:
        raise ResumeTextExtractionFailed(f"failed to decode plain text: {exc}") from exc
    if not text:
        raise ResumeTextExtractionFailed("no extractable text — file is empty")
    return text, len(text)
