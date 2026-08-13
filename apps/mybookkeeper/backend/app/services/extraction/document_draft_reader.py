"""Shared plumbing for reading a record out of a document the operator has.

Two domains do this now — a utility plan off an Electricity Facts Label, an
insurance policy off a declarations page — and only two things differ between
them: which prompt is sent, and which fields come back. Everything else is the
same work: fetch a document this organization owns, decide text-versus-vision,
and coerce whatever JSON the model returns into values a form can hold without
ever inventing one.

That common half lives here so a fix to it — a file type that was rejected, a
coercion that was letting a bad value through — lands in both domains at once
rather than in whichever one was being edited that day.

Nothing here persists anything. The result is a draft the form prefills; the
model proposes and the operator asserts.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Awaitable, Callable
from decimal import Decimal, InvalidOperation
from typing import Any

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.documents import document_repo
from app.services.extraction.extractor_service import (
    extract_text_from_docx,
    extract_text_from_pdf,
    extract_text_from_spreadsheet,
)

CONFIDENCE_VALUES = frozenset({"high", "medium", "low"})

# Below this, a PDF's embedded text layer is a scan artifact rather than the
# document, and vision reads the page better. Same threshold the transaction
# pipeline uses, for the same reason.
MIN_PDF_TEXT_CHARS = 50

#: Sends a document to the model under a domain's own prompt. Both callers are
#: ``claude_service`` wrappers with this signature.
RunExtraction = Callable[..., Awaitable[dict[str, Any]]]


class DocumentNotFoundError(LookupError):
    """No such document, or it belongs to another organization."""


class UnreadableDocumentError(ValueError):
    """The document exists but its content cannot be sent to the model."""


def as_text(value: Any, *, max_length: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


def as_int(value: Any) -> int | None:
    """Ints only, and non-negative — a negative fee is a misread, not a value."""
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = int(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return parsed if parsed >= 0 else None


def as_decimal(value: Any, *, places: str) -> Decimal | None:
    """A non-negative decimal quantized to ``places`` (e.g. ``"0.0001"``).

    The precision is the caller's because it is load-bearing per domain: the
    fourth decimal of an energy charge is a real price difference, while a
    wind/hail percentage is quoted to two.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if parsed < 0:
        return None
    return parsed.quantize(Decimal(places))


def as_date(value: Any) -> _dt.date | None:
    if not value:
        return None
    try:
        return _dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def as_string_list(value: Any) -> list[str]:
    """Strings only — this list is shown to the operator as prose.

    Unlike the scalar fields, a non-string here is not worth coercing: a bare
    ``1`` stringifies happily and then reads as a meaningless bullet under
    "things this document says that the form cannot hold".
    """
    if not isinstance(value, list):
        return []
    return [
        text
        for item in value
        if isinstance(item, str) and (text := as_text(item, max_length=500))
    ]


def known(value: Any, allowed: frozenset[str] | set[str] | tuple[str, ...]) -> str | None:
    """Drop an enum value the database would reject at INSERT time.

    The model is told the allowed values, but a hallucinated ``"fixed_rate"``
    reaching the form as a selected option is worse than an empty select — the
    operator would have to notice it was wrong rather than simply pick one.
    """
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in allowed else None


async def load_document(
    *, document_id: uuid.UUID, organization_id: uuid.UUID,
) -> tuple[bytes, str, str]:
    """Return (content, file_type, mime_type) for a document we own."""
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id_with_content(
            db, document_id, organization_id,
        )
        if doc is None:
            raise DocumentNotFoundError(str(document_id))
        storage_key = doc.file_storage_key
        content = doc.file_content
        file_type = doc.file_type or ""
        mime_type = doc.file_mime_type or ""

    if storage_key:
        storage = get_storage()
        if storage is None:
            raise UnreadableDocumentError(
                "This document is in object storage, which is not configured.",
            )
        content = storage.download_file(storage_key)

    if not content:
        raise UnreadableDocumentError("This document has no file content to read.")
    return content, file_type, mime_type


async def extract_raw(
    content: bytes,
    file_type: str,
    mime_type: str,
    *,
    run: RunExtraction,
    user_id: uuid.UUID,
    unsupported_message: str,
) -> dict[str, Any]:
    """Send the document to ``run`` as text where possible, vision otherwise."""
    if file_type == "image":
        return await run(
            image_bytes=content,
            media_type=mime_type or "image/jpeg",
            user_id=user_id,
        )
    if file_type == "pdf":
        text = await extract_text_from_pdf(content)
        if text and len(text) >= MIN_PDF_TEXT_CHARS:
            return await run(text=text, user_id=user_id)
        # A scanned document has no text layer; the numbers are only in pixels.
        return await run(
            image_bytes=content, media_type="application/pdf", user_id=user_id,
        )
    if file_type == "docx":
        return await run(text=await extract_text_from_docx(content), user_id=user_id)
    if file_type == "spreadsheet":
        return await run(
            text=await extract_text_from_spreadsheet(content, ""), user_id=user_id,
        )
    raise UnreadableDocumentError(unsupported_message)
