"""Read a utility plan out of a document the operator already uploaded.

Nothing here persists. The result is a draft the form prefills, so the operator
still reviews and saves it — the model proposes, the operator asserts. That
matters more than usual for this domain, because every field ends up in a
plan-vs-plan comparison where a wrong number is indistinguishable from a right
one.

A document can be named by id or handed over as bytes. Either way the storing is
``document_upload_service.accept_upload``'s job — it owns the size cap, the
daily rate limit and the content sniff, and going through it means the draft can
cite a ``source_document_id`` that genuinely exists and the operator can find
the file again on the Documents page.

The fetch-and-coerce half is shared with the insurance reader — see
``services/extraction/document_draft_reader``. What stays here is the part that
is actually about utility plans: which fields exist, and what makes one of them
worth warning about.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from typing import Any

from app.core.context import RequestContext
from app.core.utility_plan_constants import RATE_TYPES, SERVICE_TYPES
from app.schemas.properties.utility_plan_draft import UtilityPlanDraft
from app.services.documents import document_upload_service
from app.services.extraction.claude_service import run_utility_plan_extraction
from app.services.extraction.document_draft_reader import (
    CONFIDENCE_VALUES,
    DocumentNotFoundError,
    UnreadableDocumentError,
    as_date,
    as_decimal,
    as_int,
    as_string_list,
    as_text,
    extract_raw,
    known,
    load_document,
)

__all__ = [
    "DocumentNotFoundError",
    "UnreadableDocumentError",
    "build_draft",
    "extract_plan_from_document",
    "extract_plan_from_upload",
]

logger = logging.getLogger(__name__)

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

# The fourth decimal of a per-kWh rate is a real price difference: 5.3509
# rounded to 5.35 misprices every comparison built on it.
_RATE_PLACES = "0.0001"

# A TDU rate is a pass-through the utility re-tariffs mid-term, so the one
# printed on an EFL is only true as of its issue date. Reading the 6734 EFL on
# 2026-08-11 gave 6.0009 c/kWh against a then-current 5.1461 — a 0.85 c/kWh
# error in every comparison, silently.
_TDU_STALENESS_DAYS = 90

_UNSUPPORTED_MESSAGE = (
    "Plan terms can be read from a PDF, an image, a Word file or a spreadsheet."
)


def _warnings_for(raw: dict[str, Any], draft_fields: dict[str, Any]) -> list[str]:
    warnings: list[str] = []

    if draft_fields.get("tdu_charge_cents_per_kwh") is not None:
        issued = as_date(raw.get("document_issued_date"))
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
        "service_type": known(raw.get("service_type"), SERVICE_TYPES),
        "rate_type": known(raw.get("rate_type"), RATE_TYPES),
        "has_bill_credit": raw.get("has_bill_credit") is True,
    }
    for name in _TEXT_FIELDS:
        fields[name] = as_text(
            raw.get(name), max_length=5000 if name == "notes" else 255,
        )
    for name in _RATE_FIELDS:
        fields[name] = as_decimal(raw.get(name), places=_RATE_PLACES)
    for name in _INT_FIELDS:
        fields[name] = as_int(raw.get(name))
    for name in _DATE_FIELDS:
        fields[name] = as_date(raw.get(name))

    confidence = known(raw.get("confidence"), CONFIDENCE_VALUES) or "low"

    return UtilityPlanDraft(
        source_document_id=document_id,
        confidence=confidence,
        warnings=_warnings_for(raw, fields),
        unrepresented=as_string_list(raw.get("unrepresented")),
        **fields,
    )


async def extract_plan_from_document(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    document_id: uuid.UUID,
) -> UtilityPlanDraft:
    content, file_type, mime_type = await load_document(
        document_id=document_id, organization_id=organization_id,
    )
    raw = await extract_raw(
        content,
        file_type,
        mime_type,
        run=run_utility_plan_extraction,
        user_id=user_id,
        unsupported_message=_UNSUPPORTED_MESSAGE,
    )
    if not isinstance(raw, dict):
        # A bare list or string means the model ignored the contract. An empty
        # draft is honest; a partially-parsed one would not be.
        logger.warning(
            "utility plan extraction returned %s for document %s",
            type(raw).__name__, document_id,
        )
        raw = {}
    return build_draft(raw, document_id=document_id)


async def extract_plan_from_upload(
    *,
    ctx: RequestContext,
    content: bytes,
    filename: str,
    content_type: str,
) -> UtilityPlanDraft:
    """Store a file the operator just picked, then read the plan out of it.

    One round trip rather than upload-then-extract, because the caller is
    usually a phone: two sequential requests over a mobile connection is two
    chances to strand the operator halfway.

    The file is stored reference-only, so the transaction extractor skips it
    entirely — an Electricity Facts Label is a description of a plan, not a
    payment, and letting the usual pipeline see it would invent an expense. It
    still lands in the Documents library, which is the point: the saved plan
    cites it, and the operator can open the file it was read from.

    Raises ``ValueError`` for an upload the store refuses (too large, wrong
    type, daily limit) and ``UnreadableDocumentError`` when the file stores fine
    but holds nothing readable.
    """
    result = await document_upload_service.accept_upload(
        ctx, content, filename, content_type, reference_only=True,
    )
    document_id = uuid.UUID(str(result["document_id"]))
    return await extract_plan_from_document(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        document_id=document_id,
    )
