"""Strict text extraction for template uploads.

Unlike the tolerant extractor used for suggestions on stored files, an upload
that cannot be read is rejected before anything is written.
"""
from __future__ import annotations

from app.core.lease_template_constants import UNREADABLE_TEMPLATE_MESSAGE
from app.services.leases.exceptions.template_file_unreadable_error import (
    TemplateFileUnreadableError,
)
from app.services.leases.lease_template_placeholder_service import (
    extract_docx_text,
)
from app.services.leases.lease_template_service import DOCX_MIME

def read_template_text(filename: str, content: bytes, content_type: str) -> str:
    """Blocking (python-docx); call through ``asyncio.to_thread``."""
    if content_type != DOCX_MIME:
        return content.decode("utf-8", errors="replace")
    try:
        return extract_docx_text(content)
    except Exception as exc:
        raise TemplateFileUnreadableError(
            UNREADABLE_TEMPLATE_MESSAGE.format(filename=filename)
        ) from exc
