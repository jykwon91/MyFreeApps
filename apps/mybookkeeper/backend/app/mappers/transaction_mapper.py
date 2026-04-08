"""Transaction mapper — single source of truth for building Transaction models from extraction data."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from app.core.tags import REVENUE_TAGS, EXPENSE_TAGS, UTILITY_SUB_CATEGORIES, transaction_type_for_category
from app.core.tax_line_mapping import resolve_tax_line
from app.models.transactions.transaction import Transaction
from app.mappers.extraction_mapper import derive_category, derive_transaction_type, derive_schedule_e_line, MappedItem


def reconcile_type_category(txn_type: str, category: str) -> str:
    """Ensure transaction_type is consistent with category. Category is more reliable."""
    if txn_type == "expense" and category in REVENUE_TAGS:
        return "income"
    if txn_type == "income" and category not in REVENUE_TAGS and category != "uncategorized":
        return "expense"
    return txn_type


_SKIP_TRANSACTION_DOC_TYPES = frozenset({"1099_b"})


def build_transaction_from_mapped_item(
    item: MappedItem,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    extraction_id: uuid.UUID,
    tax_form: str | None = None,
) -> Transaction | None:
    """Build a Transaction from a MappedItem (upload path). Returns None if date or amount is missing."""
    if item.document_type in _SKIP_TRANSACTION_DOC_TYPES:
        return None

    if not item.date:
        return None

    raw = item.raw_data or {}
    category = raw.get("category") if raw.get("category") in (REVENUE_TAGS | EXPENSE_TAGS | {"uncategorized"}) else derive_category(item.tags)
    txn_type = raw.get("transaction_type") if raw.get("transaction_type") in ("income", "expense") else derive_transaction_type(item.tags)

    if item.document_type in ("tax_form", "1099") and category == "uncategorized" and txn_type == "expense":
        txn_type = "income"
        category = "rental_revenue"

    txn_type = reconcile_type_category(txn_type, category)

    amount = abs(item.amount) if item.amount is not None else None
    if amount is None or amount == 0:
        return None

    sub_category = item.sub_category if category == "utilities" else None

    return Transaction(
        organization_id=organization_id,
        user_id=user_id,
        property_id=item.property_id,
        extraction_id=extraction_id,
        transaction_date=item.date.date() if hasattr(item.date, "date") else item.date,
        tax_year=item.date.year,
        vendor=item.vendor,
        description=item.description,
        amount=amount,
        transaction_type=txn_type,
        category=category,
        sub_category=sub_category,
        tags=item.tags,
        tax_relevant=item.tax_relevant,
        schedule_e_line=resolve_tax_line(category, tax_form) if tax_form else derive_schedule_e_line(category),
        channel=item.channel,
        address=item.address,
        status=item.status,
        review_fields=item.review_fields if item.review_fields else None,
        review_reason=item.review_reason,
    )


def build_transaction_from_extraction_data(
    data: dict,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
    extraction_id: uuid.UUID | None,
    doc_date: date | datetime,
    amount: Decimal,
    vendor: str | None,
    category: str,
    tags: list[str],
    txn_type: str,
    activity_id: uuid.UUID | None = None,
    tax_form: str | None = None,
    status: str = "approved",
) -> Transaction:
    """Build a Transaction from raw extraction data dict (email path)."""
    txn_type = reconcile_type_category(txn_type, category)

    raw_sub = data.get("sub_category")
    sub_category: str | None = None
    if category == "utilities" and isinstance(raw_sub, str) and raw_sub in UTILITY_SUB_CATEGORIES:
        sub_category = raw_sub

    return Transaction(
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        extraction_id=extraction_id,
        activity_id=activity_id,
        transaction_date=doc_date.date() if hasattr(doc_date, "date") else doc_date,
        tax_year=doc_date.year,
        vendor=vendor,
        description=data.get("description"),
        amount=abs(amount),
        transaction_type=txn_type,
        category=category,
        sub_category=sub_category,
        tags=tags,
        tax_relevant=data.get("tax_relevant", False),
        schedule_e_line=resolve_tax_line(category, tax_form) if tax_form else derive_schedule_e_line(category),
        channel=data.get("channel"),
        address=data.get("address"),
        status=status,
    )
