"""Classification rule engine -- evaluates rules against transaction signals."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vendors import normalize_vendor
from app.repositories.classification import classification_rule_repo

logger = logging.getLogger(__name__)

OVERRIDABLE_CATEGORIES = frozenset({"uncategorized", "other_expense"})


async def classify(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str | None,
    current_category: str,
    address: str | None = None,
    email_sender: str | None = None,
    filename: str | None = None,
) -> tuple[str, uuid.UUID | None, uuid.UUID | None] | None:
    """Evaluate all classification rules against the given signals.

    Returns (category, property_id, activity_id) if a rule matches, or None.
    Only applies if current_category is 'uncategorized' or 'other_expense'.

    Checks rules in priority order:
    1. vendor+address (most specific)
    2. vendor-only
    3. sender
    4. filename
    5. keyword (not implemented yet -- placeholder for future)
    """
    if current_category not in OVERRIDABLE_CATEGORIES:
        return None

    normalized_vendor = normalize_vendor(vendor) if vendor else None

    if normalized_vendor and address:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "vendor", vendor, context=address,
        )
        if rule:
            await classification_rule_repo.increment_applied(db, rule)
            logger.info(
                "Classification rule matched: vendor+address %r @ %r -> %s",
                vendor, address, rule.category,
            )
            return rule.category, rule.property_id, rule.activity_id

    if normalized_vendor:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "vendor", vendor,
        )
        if rule:
            await classification_rule_repo.increment_applied(db, rule)
            logger.info(
                "Classification rule matched: vendor %r -> %s",
                vendor, rule.category,
            )
            return rule.category, rule.property_id, rule.activity_id

    if email_sender:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "sender", email_sender,
        )
        if rule:
            await classification_rule_repo.increment_applied(db, rule)
            logger.info(
                "Classification rule matched: sender %r -> %s",
                email_sender, rule.category,
            )
            return rule.category, rule.property_id, rule.activity_id

    if filename:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "filename", filename,
        )
        if rule:
            await classification_rule_repo.increment_applied(db, rule)
            logger.info(
                "Classification rule matched: filename %r -> %s",
                filename, rule.category,
            )
            return rule.category, rule.property_id, rule.activity_id

    return None
