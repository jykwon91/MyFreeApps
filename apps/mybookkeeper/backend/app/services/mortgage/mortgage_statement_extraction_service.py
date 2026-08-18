"""Read a mortgage out of a statement the operator already has.

Nothing here persists a loan. The result is a draft the form prefills, so the
operator still reviews and saves it — the model proposes, the operator asserts.
That matters especially in this domain: the rate and the balance drive a
recommendation about tens of thousands of dollars, where a wrong number is
indistinguishable from a right one.

The fetch-and-coerce half is shared with the insurance and utility readers —
see ``services/extraction/document_draft_reader``. What stays here is the part
that is actually about a mortgage: which fields exist, and what makes one of
them worth warning about.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.context import RequestContext
from app.core.mortgage_enums import RATE_TYPE_ARM, RATE_TYPE_FIXED, RATE_TYPES
from app.schemas.mortgage.mortgage_draft import MortgageDraft
from app.services.documents import document_upload_service
from app.services.extraction.claude_service import run_mortgage_statement_extraction
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
    "extract_mortgage_from_document",
    "extract_mortgage_from_upload",
]

logger = logging.getLogger(__name__)

_TEXT_FIELDS = ("lender", "account_number", "notes")
_INT_FIELDS = (
    "current_balance_cents",
    "original_principal_cents",
    "monthly_principal_cents",
    "monthly_interest_cents",
    "monthly_escrow_cents",
)
_DATE_FIELDS = ("statement_date", "fixed_until", "maturity_date")

# ``mortgages.interest_rate`` is ``Numeric(6, 3)`` — notes are written to the
# eighth of a point (7.125, 2.990).
_RATE_PLACES = "0.001"

_UNSUPPORTED_MESSAGE = (
    "Loan terms can be read from a PDF, an image, a Word file or a spreadsheet."
)


def _term_months(value: Any) -> int | None:
    """The original amortisation term, or nothing.

    Bounded by what the column accepts. A 50-year term is real; a 5,000-month
    one is a misread of something else on the page.
    """
    months = as_int(value)
    if months is None or months <= 0 or months > 600:
        return None
    return months


def _rate_and_type(raw: dict[str, Any]) -> tuple[Any, str | None, Any]:
    """The rate, whether it can move, and when it stops being guaranteed.

    Returned together because the three constrain each other and the row
    rejects an inconsistent set. Two corrections are applied here rather than
    left to the operator:

    * A rate outside the column's range is dropped. The specific misread to
      fear is a percentage returned as a fraction — 0.07125 for 7.125% — which
      would survive every downstream check and quietly claim the loan is four
      hundred basis points below market.
    * A ``fixed_until`` on a loan reported as fixed is contradictory. The date
      is the stronger evidence: a document does not print a date the rate lasts
      until unless the rate stops there, so the loan is re-reported as
      adjustable and the operator is told. Dropping the date instead would
      erase the only signal that the loan cannot be benchmarked.
    """
    rate = as_decimal(raw.get("interest_rate"), places=_RATE_PLACES)
    if rate is not None and (rate <= 0 or rate >= 25):
        rate = None

    rate_type = known(raw.get("rate_type"), RATE_TYPES)
    fixed_until = as_date(raw.get("fixed_until"))

    if fixed_until is not None and rate_type != RATE_TYPE_ARM:
        rate_type = RATE_TYPE_ARM

    return rate, rate_type, fixed_until


def _warnings_for(fields: dict[str, Any], *, raw: dict[str, Any]) -> list[str]:
    warnings: list[str] = []

    rate_type = fields.get("rate_type")
    if rate_type is None:
        warnings.append(
            "I couldn't tell from this statement whether the rate is fixed for "
            "the life of the loan or can adjust later. It changes whether this "
            "loan can be compared to the market at all, so pick one before "
            "saving.",
        )
    elif rate_type == RATE_TYPE_ARM and fields.get("fixed_until") is None:
        warnings.append(
            "This looks like an adjustable-rate loan but the statement didn't "
            "say when the current rate ends. That date is worth adding — it's "
            "the deadline that actually matters on an ARM.",
        )
    elif (
        known(raw.get("rate_type"), RATE_TYPES) == RATE_TYPE_FIXED
        and fields.get("fixed_until") is not None
    ):
        warnings.append(
            "The statement gave a date the interest rate runs until, which a "
            "genuinely fixed loan wouldn't have — so I've recorded it as "
            "adjustable. Check the note before saving.",
        )

    balance = fields.get("current_balance_cents")
    if balance is not None and fields.get("statement_date") is None:
        warnings.append(
            "I read a balance but no statement date. A balance is only true as "
            "of a date, so add the date this statement covers.",
        )

    if balance is None and fields.get("interest_rate") is not None:
        warnings.append(
            "I read the interest rate but not the remaining balance. Without a "
            "balance a rate difference can't be turned into dollars, which is "
            "the only form worth acting on.",
        )

    principal = fields.get("monthly_principal_cents")
    interest = fields.get("monthly_interest_cents")
    if (principal is None) != (interest is None):
        warnings.append(
            "I found only half of the monthly payment split. Principal and "
            "interest are needed together to work out how many payments are "
            "left — add the missing half, or the payoff date instead.",
        )

    if (
        fields.get("maturity_date") is None
        and principal is None
        and interest is None
    ):
        warnings.append(
            "This statement gave neither a payoff date nor a monthly principal "
            "and interest split, so there's no way to tell how many payments "
            "are left. Add either one and this loan can be compared.",
        )

    return warnings


def build_draft(raw: dict[str, Any], *, document_id: uuid.UUID) -> MortgageDraft:
    """Coerce the model's JSON into a draft, dropping anything unusable.

    Every field is parsed independently: one unreadable date must not cost the
    operator the eight fields that were read correctly.
    """
    rate, rate_type, fixed_until = _rate_and_type(raw)
    fields: dict[str, Any] = {
        "interest_rate": rate,
        "rate_type": rate_type,
        "fixed_until": fixed_until,
        "term_months": _term_months(raw.get("term_months")),
    }
    for name in _TEXT_FIELDS:
        fields[name] = as_text(
            raw.get(name), max_length=5000 if name == "notes" else 255,
        )
    for name in _INT_FIELDS:
        fields[name] = as_int(raw.get(name))
    for name in _DATE_FIELDS:
        if name not in fields:
            fields[name] = as_date(raw.get(name))

    confidence = known(raw.get("confidence"), CONFIDENCE_VALUES) or "low"

    return MortgageDraft(
        source_document_id=document_id,
        confidence=confidence,
        warnings=_warnings_for(fields, raw=raw),
        unrepresented=as_string_list(raw.get("unrepresented")),
        **fields,
    )


async def extract_mortgage_from_document(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    document_id: uuid.UUID,
) -> MortgageDraft:
    content, file_type, mime_type = await load_document(
        document_id=document_id, organization_id=organization_id,
    )
    raw = await extract_raw(
        content,
        file_type,
        mime_type,
        run=run_mortgage_statement_extraction,
        user_id=user_id,
        unsupported_message=_UNSUPPORTED_MESSAGE,
    )
    if not isinstance(raw, dict):
        # A bare list or string means the model ignored the contract. An empty
        # draft is honest; a partially-parsed one would not be.
        logger.warning(
            "mortgage statement extraction returned %s for document %s",
            type(raw).__name__, document_id,
        )
        raw = {}
    return build_draft(raw, document_id=document_id)


async def extract_mortgage_from_upload(
    *,
    ctx: RequestContext,
    content: bytes,
    filename: str,
    content_type: str,
) -> MortgageDraft:
    """Store a statement the operator just picked, then read the loan out of it.

    One round trip rather than upload-then-extract, because the caller is
    usually a phone.

    The file is stored reference-only, so the transaction extractor skips it: a
    mortgage statement is a description of a debt, and letting the usual
    pipeline see it would invent an expense out of the payment printed on it.
    It still lands in the Documents library, which is the point — the operator
    can open the statement the loan was read from.
    """
    result = await document_upload_service.accept_upload(
        ctx, content, filename, content_type, reference_only=True,
    )
    document_id = uuid.UUID(str(result["document_id"]))
    return await extract_mortgage_from_document(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        document_id=document_id,
    )
