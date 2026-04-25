"""Maps Claude extraction output to structured items and determines review status.

Pure data transformation — no I/O, no DB access. The orchestration layer
(document_extraction_service / extraction_persistence) handles dedup and property matching.
"""
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.core.parsers import safe_date, safe_decimal
from app.core.tags import REVENUE_TAGS, EXPENSE_TAGS, CATEGORY_TO_SCHEDULE_E, UTILITY_SUB_CATEGORIES, sanitize_tags

logger = logging.getLogger(__name__)

_LINEN_ALLOWED_TAGS = frozenset({
    "maintenance", "cleaning_expense", "other_expense", "contract_work",
})

_PROPERTY_REQUIRED_TAGS = frozenset({
    "maintenance", "utilities", "cleaning_expense", "mortgage_interest", "mortgage_principal",
    "insurance", "taxes", "rental_revenue", "cleaning_fee_revenue", "management_fee",
    "net_income", "contract_work",
})


@dataclass
class MappedItem:
    """Result of mapping one Claude extraction item to document fields."""
    vendor: str | None
    date: datetime | None
    amount: Decimal | None
    description: str | None
    tags: list[str]
    tax_relevant: bool
    channel: str | None
    address: str | None
    document_type: str
    line_items: list[dict] | None
    confidence: str | None
    property_id: uuid.UUID | None
    status: str
    review_fields: list[str]
    review_reason: str | None
    raw_data: dict
    sub_category: str | None = None


def sanitize_extraction_tags(raw_tags: list | None) -> list[str]:
    """Sanitize tags from Claude output, removing invalid linen combinations."""
    doc_tags: list[str] = sanitize_tags(raw_tags or []) or ["uncategorized"]
    if "linen" in doc_tags and not any(t in _LINEN_ALLOWED_TAGS for t in doc_tags):
        doc_tags = [t for t in doc_tags if t != "linen"]
    return doc_tags


def determine_review_status(
    vendor: str | None,
    amount: Decimal | None,
    document_type: str,
    property_id: uuid.UUID | None,
    tags: list[str],
    property_classification: str | None = None,
) -> tuple[str, str | None, list[str]]:
    """Determine transaction status and review fields based on extraction quality.

    Returns (status, review_reason, review_fields).
    Dedup-related review reasons are handled separately by resolve_and_link.
    """
    has_useful_data = bool(vendor) or amount is not None
    is_unrecognized = document_type == "other"

    if not has_useful_data:
        return (
            "needs_review",
            "Could not extract data from this document",
            ["vendor", "amount", "date", "tags", "property_id"],
        )
    if is_unrecognized:
        return (
            "needs_review",
            "Unrecognized document type — contact support to add support for this format",
            ["document_type"],
        )
    if not property_id and any(t in _PROPERTY_REQUIRED_TAGS for t in tags):
        return (
            "needs_review",
            "No property assigned — please assign a property",
            ["property_id"],
        )
    if property_classification == "UNCLASSIFIED":
        return (
            "needs_review",
            "Property needs classification before tax forms can be computed",
            ["property_classification"],
        )
    return ("approved", None, [])


def _extract_sub_category(data: dict, tags: list[str]) -> str | None:
    """Extract and validate sub_category; only valid for utilities category."""
    category = derive_category(tags)
    if category != "utilities":
        return None
    raw = data.get("sub_category")
    if isinstance(raw, str) and raw in UTILITY_SUB_CATEGORIES:
        return raw
    return None


def map_single_item(
    data: dict,
    property_id: uuid.UUID | None,
) -> MappedItem:
    """Map a single Claude extraction item to a MappedItem (pure, no I/O)."""
    vendor = data.get("vendor")
    doc_date = safe_date(data.get("date"))
    doc_tags = sanitize_extraction_tags(data.get("tags"))
    amount = safe_decimal(data.get("amount"))
    doc_type = data.get("document_type", "invoice")
    sub_category = _extract_sub_category(data, doc_tags)

    status, review_reason, review_fields = determine_review_status(
        vendor, amount, doc_type, property_id, doc_tags,
    )

    return MappedItem(
        vendor=vendor,
        date=doc_date,
        amount=amount,
        description=data.get("description"),
        tags=doc_tags,
        tax_relevant=data.get("tax_relevant", False),
        channel=data.get("channel"),
        address=data.get("address"),
        document_type=doc_type,
        line_items=data.get("line_items"),
        confidence=data.get("confidence"),
        property_id=property_id,
        status=status,
        review_fields=review_fields,
        review_reason=review_reason,
        raw_data=data,
        sub_category=sub_category,
    )


def derive_transaction_type(tags: list[str]) -> str:
    """Derive income/expense from tags."""
    if any(t in REVENUE_TAGS for t in tags):
        return "income"
    return "expense"


def derive_category(tags: list[str]) -> str:
    """Derive primary financial category from tags."""
    for t in tags:
        if t in REVENUE_TAGS or t in EXPENSE_TAGS:
            return t
    return "uncategorized"


def derive_schedule_e_line(category: str) -> str | None:
    """Map a category to its Schedule E line."""
    return CATEGORY_TO_SCHEDULE_E.get(category)
