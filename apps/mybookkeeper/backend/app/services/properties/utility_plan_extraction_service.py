"""Read a utility plan out of a document the operator already uploaded.

Nothing here persists. The result is a draft the form prefills, so the operator
still reviews and saves it — the model proposes, the operator asserts. That
matters more than usual for this domain, because every field ends up in a
plan-vs-plan comparison where a wrong number is indistinguishable from a right
one.

The document arrives by id, not by upload: ``POST /documents/upload`` already
owns the size cap, the daily rate limit and the content sniff, and reusing it
means the draft can cite a ``source_document_id`` that genuinely exists.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from app.core.storage import get_storage
from app.core.utility_plan_constants import RATE_TYPES, SERVICE_TYPES
from app.db.session import unit_of_work
from app.repositories.documents import document_repo
from app.schemas.properties.utility_plan_draft import UtilityPlanDraft
from app.services.extraction.claude_service import run_utility_plan_extraction
from app.services.extraction.extractor_service import (
    extract_text_from_docx,
    extract_text_from_pdf,
    extract_text_from_spreadsheet,
)

logger = logging.getLogger(__name__)

_CONFIDENCE_VALUES = frozenset({"high", "medium", "low"})

# Below this, a PDF's embedded text layer is a scan artifact rather than the
# document, and vision reads the page better. Same threshold the transaction
# pipeline uses, for the same reason.
_MIN_PDF_TEXT_CHARS = 50

_RATE_FIELDS = (
    "energy_charge_cents_per_kwh",
    "tdu_charge_cents_per_kwh",
    "avg_price_cents_per_kwh_at_1000",
)
_INT_FIELDS = (
    "monthly_base_charge_cents",
    "term_months",
    "early_termination_fee_cents",
    "bill_credit_amount_cents",
    "bill_credit_threshold_kwh",
    "min_usage_fee_cents",
    "min_usage_threshold_kwh",
    "post_promo_monthly_cents",
    "equipment_fee_monthly_cents",
    "download_mbps",
    "upload_mbps",
    "data_cap_gb",
)
_DATE_FIELDS = ("service_start_date", "term_end_date")
_TEXT_FIELDS = ("provider_name", "plan_name", "account_number", "notes")

# A TDU rate is a pass-through the utility re-tariffs mid-term, so the one
# printed on an EFL is only true as of its issue date. Reading the 6734 EFL on
# 2026-08-11 gave 6.0009 c/kWh against a then-current 5.1461 — a 0.85 c/kWh
# error in every comparison, silently.
_TDU_STALENESS_DAYS = 90


class DocumentNotFoundError(LookupError):
    """No such document, or it belongs to another organization."""


class UnreadableDocumentError(ValueError):
    """The document exists but its content cannot be sent to the model."""


def _as_text(value: Any, *, max_length: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


def _as_int(value: Any) -> int | None:
    """Ints only, and non-negative — a negative fee is a misread, not a value."""
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = int(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return parsed if parsed >= 0 else None


def _as_rate(value: Any) -> Decimal | None:
    """Four decimal places, because the fourth is load-bearing (5.3509)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if parsed < 0:
        return None
    return parsed.quantize(Decimal("0.0001"))


def _as_date(value: Any) -> _dt.date | None:
    if not value:
        return None
    try:
        return _dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _as_string_list(value: Any) -> list[str]:
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
        if isinstance(item, str) and (text := _as_text(item, max_length=500))
    ]


def _known(value: Any, allowed: frozenset[str] | set[str]) -> str | None:
    """Drop an enum value the database would reject at INSERT time.

    The model is told the allowed values, but a hallucinated ``"fixed_rate"``
    reaching the form as a selected option is worse than an empty select — the
    operator would have to notice it was wrong rather than simply pick one.
    """
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in allowed else None


def _warnings_for(raw: dict[str, Any], draft_fields: dict[str, Any]) -> list[str]:
    warnings: list[str] = []

    if draft_fields.get("tdu_charge_cents_per_kwh") is not None:
        issued = _as_date(raw.get("document_issued_date"))
        age = (_dt.date.today() - issued).days if issued else None
        if age is None or age > _TDU_STALENESS_DAYS:
            warnings.append(
                "The delivery (TDU) charge is a pass-through the utility can "
                "re-tariff mid-term, so the one printed on this document may no "
                "longer be current. Check it against a recent bill before saving.",
            )

    if draft_fields.get("has_bill_credit") and (
        draft_fields.get("bill_credit_amount_cents") is None
        or draft_fields.get("bill_credit_threshold_kwh") is None
    ):
        warnings.append(
            "This plan has a bill credit but the document did not state both "
            "the amount and the usage it applies at. A plan cannot be saved "
            "with only one of the two.",
        )

    if (
        draft_fields.get("post_promo_monthly_cents") is not None
        and draft_fields.get("term_end_date") is None
    ):
        warnings.append(
            "A price applies after the promotional period, but the document did "
            "not say when that period ends. Set an end date before saving.",
        )

    return warnings


def build_draft(raw: dict[str, Any], *, document_id: uuid.UUID) -> UtilityPlanDraft:
    """Coerce the model's JSON into a draft, dropping anything unusable.

    Every field is parsed independently: one unreadable rate must not cost the
    operator the eleven fields that were read correctly.
    """
    fields: dict[str, Any] = {
        "service_type": _known(raw.get("service_type"), SERVICE_TYPES),
        "rate_type": _known(raw.get("rate_type"), RATE_TYPES),
        "has_bill_credit": raw.get("has_bill_credit") is True,
    }
    for name in _TEXT_FIELDS:
        fields[name] = _as_text(
            raw.get(name), max_length=5000 if name == "notes" else 255,
        )
    for name in _RATE_FIELDS:
        fields[name] = _as_rate(raw.get(name))
    for name in _INT_FIELDS:
        fields[name] = _as_int(raw.get(name))
    for name in _DATE_FIELDS:
        fields[name] = _as_date(raw.get(name))

    confidence = _known(raw.get("confidence"), _CONFIDENCE_VALUES) or "low"

    return UtilityPlanDraft(
        source_document_id=document_id,
        confidence=confidence,
        warnings=_warnings_for(raw, fields),
        unrepresented=_as_string_list(raw.get("unrepresented")),
        **fields,
    )


async def _load_document(
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


async def _extract_raw(
    content: bytes, file_type: str, mime_type: str, *, user_id: uuid.UUID,
) -> dict[str, Any]:
    """Send the document to the model as text where possible, vision otherwise."""
    if file_type == "image":
        return await run_utility_plan_extraction(
            image_bytes=content,
            media_type=mime_type or "image/jpeg",
            user_id=user_id,
        )
    if file_type == "pdf":
        text = await extract_text_from_pdf(content)
        if text and len(text) >= _MIN_PDF_TEXT_CHARS:
            return await run_utility_plan_extraction(text=text, user_id=user_id)
        # A scanned EFL has no text layer; the numbers are only in the pixels.
        return await run_utility_plan_extraction(
            image_bytes=content, media_type="application/pdf", user_id=user_id,
        )
    if file_type == "docx":
        return await run_utility_plan_extraction(
            text=await extract_text_from_docx(content), user_id=user_id,
        )
    if file_type == "spreadsheet":
        return await run_utility_plan_extraction(
            text=await extract_text_from_spreadsheet(content, ""), user_id=user_id,
        )
    raise UnreadableDocumentError(
        "Plan terms can be read from a PDF, an image, a Word file or a spreadsheet.",
    )


async def extract_plan_from_document(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    document_id: uuid.UUID,
) -> UtilityPlanDraft:
    content, file_type, mime_type = await _load_document(
        document_id=document_id, organization_id=organization_id,
    )
    raw = await _extract_raw(content, file_type, mime_type, user_id=user_id)
    if not isinstance(raw, dict):
        # A bare list or string means the model ignored the contract. An empty
        # draft is honest; a partially-parsed one would not be.
        logger.warning(
            "utility plan extraction returned %s for document %s",
            type(raw).__name__, document_id,
        )
        raw = {}
    return build_draft(raw, document_id=document_id)
