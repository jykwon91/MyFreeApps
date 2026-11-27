"""Rule learning service -- learns classification rules from user corrections."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tags import (
    TRANSFER_CATEGORY,
    VENDOR_SPLIT_CATEGORIES,
    schedule_e_line_after_category_change,
    transaction_type_for_category,
)
from app.core.tax_total_inputs import tax_total_inputs
from app.core.payee_keys import payee_key
from app.core.vendors import normalize_address
from app.models.classification.classification_rule import ClassificationRule
from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.repositories.classification import classification_rule_repo
from app.repositories.tax import tax_return_repo
from app.services.system.event_service import record_event

logger = logging.getLogger(__name__)


async def learn_from_correction(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    transaction: Transaction,
    old_category: str,
) -> int:
    """Record a classification rule from a user correction and retroactively fix matching transactions.

    Returns count of retroactively updated transactions.
    """
    if not transaction.vendor:
        return 0

    new_category = transaction.category
    if new_category == old_category:
        return 0
    if {new_category, old_category} & VENDOR_SPLIT_CATEGORIES:
        return 0
    # Whether a payment is a transfer depends on which accounts it ran
    # between, not on who it was to, so it is not a vendor rule. Rules cannot
    # name the transfer category either (classification_rule.VALID_CATEGORIES).
    if TRANSFER_CATEGORY in {new_category, old_category}:
        return 0

    existing = await _matching_rule(db, organization_id, transaction.vendor)
    if not _already_says(existing, transaction.vendor, new_category, transaction.property_id):
        await classification_rule_repo.upsert_rule(
            db,
            organization_id=organization_id,
            match_type="vendor",
            pattern=transaction.vendor,
            category=new_category,
            created_by=user_id,
            source=_source_for(existing, transaction.vendor),
            property_id=transaction.property_id,
            activity_id=transaction.activity_id,
            # This corrects a category. A row with no property says nothing about
            # where the vendor's other rows belong.
            keep_assignment_when_unset=True,
        )

    retroactive_count = await _retroactive_category_fix(
        db,
        organization_id=organization_id,
        vendor=transaction.vendor,
        new_category=new_category,
        old_category=old_category,
        new_activity_id=transaction.activity_id,
        exclude_id=transaction.id,
    )

    if retroactive_count > 0:
        logger.info(
            "Classification rule learned: %r -> %s (retroactively fixed %d transactions)",
            transaction.vendor, new_category, retroactive_count,
        )

    try:
        await record_event(
            organization_id, "category_corrected", "info",
            f"Category corrected for vendor '{transaction.vendor}': {old_category} -> {new_category}",
            {
                "vendor": transaction.vendor,
                "old_category": old_category,
                "new_category": new_category,
                "retroactive_count": retroactive_count,
            },
        )
    except Exception:
        pass

    return retroactive_count


async def learn_from_property_correction(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    transaction: Transaction,
) -> int:
    """Record a vendor+address->property rule and retroactively fix matching transactions.

    Returns count of retroactively updated transactions.
    """
    if not transaction.vendor or not transaction.address:
        return 0
    if transaction.category == TRANSFER_CATEGORY:
        return 0

    existing = await _matching_rule(db, organization_id, transaction.vendor, transaction.address)
    if not _already_says(existing, transaction.vendor, transaction.category, transaction.property_id):
        await classification_rule_repo.upsert_rule(
            db,
            organization_id=organization_id,
            match_type="vendor",
            pattern=transaction.vendor,
            category=transaction.category,
            created_by=user_id,
            source=_source_for(existing, transaction.vendor),
            context=transaction.address,
            property_id=transaction.property_id,
            activity_id=transaction.activity_id,
        )

    retroactive_count = await _retroactive_property_fix(
        db,
        organization_id=organization_id,
        vendor=transaction.vendor,
        address=transaction.address,
        new_property_id=transaction.property_id,
        exclude_id=transaction.id,
    )

    if retroactive_count > 0:
        logger.info(
            "Property rule learned from transaction %s -> %s (retroactively fixed %d transactions)",
            transaction.id, transaction.property_id, retroactive_count,
        )

    try:
        await record_event(
            organization_id, "property_corrected", "info",
            f"Property corrected for vendor '{transaction.vendor}' at '{transaction.address}'",
            {
                "vendor": transaction.vendor,
                "address": transaction.address,
                "new_property_id": str(transaction.property_id) if transaction.property_id else None,
                "retroactive_count": retroactive_count,
            },
        )
    except Exception:
        pass

    return retroactive_count


async def _matching_rule(
    db: AsyncSession, organization_id: uuid.UUID, vendor: str, address: str | None = None,
) -> ClassificationRule | None:
    """The rule this payee (at this address, when given) already matches."""
    rule = await classification_rule_repo.get_matching_rule(db, organization_id, "vendor", vendor, context=address)
    if rule is None or rule.match_context != (normalize_address(address) or None):
        return None
    return rule


def _is_this_payee(rule: ClassificationRule | None, vendor: str) -> bool:
    """Whether the rule is keyed on exactly this payee, so the correction updates it."""
    return rule is not None and rule.match_pattern == payee_key(vendor, None)


def _already_says(
    rule: ClassificationRule | None, vendor: str, category: str, property_id: uuid.UUID | None,
) -> bool:
    """Whether a broader rule ("zelle payment to jason law" for "zelle payment to jason
    lawn guy") already files this payee the way the correction does, so a near-duplicate
    would add nothing. A correction that disagrees gets its own rule on the payee, and the
    longer pattern wins when both match."""
    if rule is None or _is_this_payee(rule, vendor):
        return False
    return rule.category == category and property_id in (None, rule.property_id)


def _source_for(rule: ClassificationRule | None, vendor: str) -> str:
    """A rule the person made stays theirs when a correction updates it."""
    return rule.source if rule is not None and _is_this_payee(rule, vendor) else "user_correction"


async def _retroactive_category_fix(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str,
    new_category: str,
    old_category: str,
    new_activity_id: uuid.UUID | None,
    exclude_id: uuid.UUID,
) -> int:
    """Update other transactions to the same payee (``payee_key``) with the old category."""
    normalized = payee_key(vendor, None)
    if not normalized:
        return 0

    fixable_categories = {"uncategorized", "other_expense", old_category}

    candidates = await transaction_repo.find_by_vendor_for_retroactive(
        db, organization_id, exclude_id, categories=fixable_categories,
    )

    updated = 0
    totals_moved = False
    for txn in candidates:
        if payee_key(txn.vendor, None) == normalized:
            old_tax_inputs = tax_total_inputs(txn)
            txn.schedule_e_line = schedule_e_line_after_category_change(
                txn.schedule_e_line, txn.category, new_category,
            )
            txn.category = new_category
            txn.transaction_type = transaction_type_for_category(new_category)
            txn.activity_id = new_activity_id
            totals_moved = totals_moved or tax_total_inputs(txn) != old_tax_inputs
            updated += 1

    if totals_moved:
        await tax_return_repo.flag_unfiled_for_recompute(db, organization_id)
    return updated


async def _retroactive_property_fix(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str,
    address: str,
    new_property_id: uuid.UUID | None,
    exclude_id: uuid.UUID,
) -> int:
    """Update other transactions to the same payee+address with a different property_id."""
    normalized_vendor = payee_key(vendor, None)
    normalized_addr = normalize_address(address)
    if not normalized_vendor or not normalized_addr:
        return 0

    candidates = await transaction_repo.find_by_vendor_for_retroactive(
        db, organization_id, exclude_id, require_address=True,
    )

    updated = 0
    totals_moved = False
    for txn in candidates:
        if (
            payee_key(txn.vendor, None) == normalized_vendor
            and normalize_address(txn.address) == normalized_addr
            and txn.property_id != new_property_id
        ):
            totals_moved = totals_moved or tax_total_inputs(txn) is not None
            txn.property_id = new_property_id
            updated += 1

    if totals_moved:
        await tax_return_repo.flag_unfiled_for_recompute(db, organization_id)
    return updated
