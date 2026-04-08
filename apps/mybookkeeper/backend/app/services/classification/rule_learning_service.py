"""Rule learning service -- learns classification rules from user corrections."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tags import transaction_type_for_category
from app.core.vendors import normalize_address, normalize_vendor
from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.repositories.classification import classification_rule_repo
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

    await classification_rule_repo.upsert_rule(
        db,
        organization_id=organization_id,
        match_type="vendor",
        pattern=transaction.vendor,
        category=new_category,
        created_by=user_id,
        source="user_correction",
        property_id=transaction.property_id,
        activity_id=transaction.activity_id,
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

    await classification_rule_repo.upsert_rule(
        db,
        organization_id=organization_id,
        match_type="vendor",
        pattern=transaction.vendor,
        category=transaction.category,
        created_by=user_id,
        source="user_correction",
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
            "Property rule learned: %r @ %r -> %s (retroactively fixed %d transactions)",
            transaction.vendor, transaction.address,
            transaction.property_id, retroactive_count,
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


async def _retroactive_category_fix(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str,
    new_category: str,
    old_category: str,
    new_activity_id: uuid.UUID | None,
    exclude_id: uuid.UUID,
) -> int:
    """Update other transactions from the same vendor with the old category."""
    normalized = normalize_vendor(vendor)
    if not normalized:
        return 0

    fixable_categories = {"uncategorized", "other_expense", old_category}

    candidates = await transaction_repo.find_by_vendor_for_retroactive(
        db, organization_id, exclude_id, categories=fixable_categories,
    )

    updated = 0
    for txn in candidates:
        if normalize_vendor(txn.vendor) == normalized:
            txn.category = new_category
            txn.transaction_type = transaction_type_for_category(new_category)
            txn.activity_id = new_activity_id
            updated += 1

    return updated


async def _retroactive_property_fix(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str,
    address: str,
    new_property_id: uuid.UUID | None,
    exclude_id: uuid.UUID,
) -> int:
    """Update other transactions from the same vendor+address with a different property_id."""
    normalized_vendor = normalize_vendor(vendor)
    normalized_addr = normalize_address(address)
    if not normalized_vendor or not normalized_addr:
        return 0

    candidates = await transaction_repo.find_by_vendor_for_retroactive(
        db, organization_id, exclude_id, require_address=True,
    )

    updated = 0
    for txn in candidates:
        if (
            normalize_vendor(txn.vendor) == normalized_vendor
            and normalize_address(txn.address) == normalized_addr
            and txn.property_id != new_property_id
        ):
            txn.property_id = new_property_id
            updated += 1

    return updated
