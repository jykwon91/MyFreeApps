"""Read an insurance policy out of a document the operator already has.

Nothing here persists a policy. The result is a draft the form prefills, so the
operator still reviews and saves it — the model proposes, the operator asserts.
That matters for this domain specifically because the premium and the dwelling
limit feed the "are you overpaying" comparison, where a wrong number is
indistinguishable from a right one.

A document can be named by id or handed over as bytes. Either way the storing is
``document_upload_service.accept_upload``'s job — it owns the size cap, the
daily rate limit and the content sniff, and going through it means the draft can
cite a ``source_document_id`` that genuinely exists and the operator can find
the file again on the Documents page.

The fetch-and-coerce half is shared with the utility-plan reader — see
``services/extraction/document_draft_reader``. What stays here is the part that
is actually about insurance: which fields exist, and what makes one of them
worth warning about.
"""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Any

from app.core.context import RequestContext
from app.core.insurance_enums import PREMIUM_FREQUENCIES
from app.schemas.insurance.insurance_policy_draft import InsurancePolicyDraft
from app.services.documents import document_upload_service
from app.services.extraction.claude_service import run_insurance_policy_extraction
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
    "extract_policy_from_document",
    "extract_policy_from_upload",
]

logger = logging.getLogger(__name__)

_TEXT_FIELDS = ("policy_name", "carrier", "policy_number", "notes")
_INT_FIELDS = ("coverage_amount_cents", "deductible_cents", "fees_and_taxes_cents")
_DATE_FIELDS = ("effective_date", "expiration_date")

# Wind/hail is quoted to two places — "2%", "1.5%" — and the column is
# ``Numeric(5, 2)``.
_PCT_PLACES = "0.01"

_UNSUPPORTED_MESSAGE = (
    "Policy terms can be read from a PDF, an image, a Word file or a spreadsheet."
)


def _premium(raw: dict[str, Any]) -> tuple[int | None, str | None]:
    """The premium and its billing period, or nothing.

    The premium alone — fees and taxes come back in their own field and are
    coerced with the other integers. Nothing here reconciles the two against a
    stated total: the model is asked to check that arithmetic and to say so in
    its notes when it does not hold, because it is the only party that can see
    which of the three figures the document actually printed.

    A zero premium is not a free policy, it is a failed read, so it is dropped
    rather than recorded — unlike a zero deductible, which is a real
    first-dollar product.

    The two are returned together because the row rejects half a pair. Both
    halves are kept even when only one arrived, though: the form has to show
    the operator what was found so they can supply the other, and the warning
    below tells them to. Dropping the half that did arrive would hide the fact
    that the document said anything about price at all.
    """
    amount = as_int(raw.get("premium_cents"))
    if amount == 0:
        amount = None
    return amount, known(raw.get("premium_frequency"), PREMIUM_FREQUENCIES)


def _wind_hail_pct(value: Any) -> Decimal | None:
    """A percentage of dwelling coverage, or nothing.

    The column allows 0 < pct <= 100. A "2%" deductible reported as the
    fraction 0.02 is the misread to fear here — it is in range, so nothing
    downstream would catch it — but a percentage under 1 is also a real
    product, so it cannot be rejected on size. The prompt is where that is
    addressed; this only drops what the column would refuse.
    """
    pct = as_decimal(value, places=_PCT_PLACES)
    if pct is None or pct <= 0 or pct > 100:
        return None
    return pct


def _warnings_for(fields: dict[str, Any]) -> list[str]:
    warnings: list[str] = []

    premium = fields.get("premium_cents")
    frequency = fields.get("premium_frequency")
    if (premium is None) != (frequency is None):
        missing = "how often it's billed" if frequency is None else "the amount"
        warnings.append(
            f"I found part of the premium but not {missing}. A policy can't be "
            "saved with only one of the two — the amount means nothing without "
            "the period it covers.",
        )

    # Fees are only meaningful next to the premium they sit on top of. On their
    # own they would show on the form as the cost of the policy, which is the
    # one reading of them that is never true.
    fees = fields.get("fees_and_taxes_cents")
    if fees is not None and premium is None:
        warnings.append(
            "I found fees and taxes on this document but couldn't read the "
            "premium itself. Fees on their own aren't the cost of the policy — "
            "add the premium before saving.",
        )

    if premium is not None and fields.get("coverage_amount_cents") is None:
        warnings.append(
            "This document gave a premium but no dwelling coverage amount, so "
            "this policy won't be checked against your market premium. Add the "
            "dwelling limit (Coverage A) to include it.",
        )

    effective = fields.get("effective_date")
    expiration = fields.get("expiration_date")
    if effective and expiration and expiration <= effective:
        warnings.append(
            "The expiration date I read is not after the effective date, so one "
            "of the two is misread. Check both before saving.",
        )

    if (
        fields.get("wind_hail_deductible_pct") is not None
        and fields.get("coverage_amount_cents") is None
    ):
        warnings.append(
            "The wind/hail deductible is a percentage of dwelling coverage, and "
            "this document did not state that coverage amount — so there is no "
            "way to tell what the deductible works out to in dollars.",
        )

    return warnings


def build_draft(raw: dict[str, Any], *, document_id: uuid.UUID) -> InsurancePolicyDraft:
    """Coerce the model's JSON into a draft, dropping anything unusable.

    Every field is parsed independently: one unreadable date must not cost the
    operator the eight fields that were read correctly.
    """
    premium_cents, premium_frequency = _premium(raw)
    fields: dict[str, Any] = {
        "premium_cents": premium_cents,
        "premium_frequency": premium_frequency,
        "wind_hail_deductible_pct": _wind_hail_pct(raw.get("wind_hail_deductible_pct")),
    }
    for name in _TEXT_FIELDS:
        fields[name] = as_text(
            raw.get(name), max_length=5000 if name == "notes" else 255,
        )
    for name in _INT_FIELDS:
        fields[name] = as_int(raw.get(name))
    for name in _DATE_FIELDS:
        fields[name] = as_date(raw.get(name))

    confidence = known(raw.get("confidence"), CONFIDENCE_VALUES) or "low"

    return InsurancePolicyDraft(
        source_document_id=document_id,
        confidence=confidence,
        warnings=_warnings_for(fields),
        unrepresented=as_string_list(raw.get("unrepresented")),
        **fields,
    )


async def extract_policy_from_document(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    document_id: uuid.UUID,
) -> InsurancePolicyDraft:
    content, file_type, mime_type = await load_document(
        document_id=document_id, organization_id=organization_id,
    )
    raw = await extract_raw(
        content,
        file_type,
        mime_type,
        run=run_insurance_policy_extraction,
        user_id=user_id,
        unsupported_message=_UNSUPPORTED_MESSAGE,
    )
    if not isinstance(raw, dict):
        # A bare list or string means the model ignored the contract. An empty
        # draft is honest; a partially-parsed one would not be.
        logger.warning(
            "insurance policy extraction returned %s for document %s",
            type(raw).__name__, document_id,
        )
        raw = {}
    return build_draft(raw, document_id=document_id)


async def extract_policy_from_upload(
    *,
    ctx: RequestContext,
    content: bytes,
    filename: str,
    content_type: str,
) -> InsurancePolicyDraft:
    """Store a file the operator just picked, then read the policy out of it.

    One round trip rather than upload-then-extract, because the caller is
    usually a phone: two sequential requests over a mobile connection is two
    chances to strand the operator halfway.

    The file is stored reference-only, so the transaction extractor skips it
    entirely — a declarations page is a description of cover, not a payment, and
    letting the usual pipeline see it would invent an expense out of the annual
    premium printed on it. It still lands in the Documents library, which is the
    point: the operator can open the file the policy was read from.

    Raises ``ValueError`` for an upload the store refuses (too large, wrong
    type, daily limit) and ``UnreadableDocumentError`` when the file stores fine
    but holds nothing readable.
    """
    result = await document_upload_service.accept_upload(
        ctx, content, filename, content_type, reference_only=True,
    )
    document_id = uuid.UUID(str(result["document_id"]))
    return await extract_policy_from_document(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        document_id=document_id,
    )
