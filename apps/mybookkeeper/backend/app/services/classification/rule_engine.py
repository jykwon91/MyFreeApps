"""Classification rule engine -- evaluates rules against transaction signals."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vendors import normalize_vendor
from app.models.classification.classification_rule import ClassificationRule
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

    rule = await find_vendor_rule(db, organization_id, vendor, address=address)
    if rule:
        await classification_rule_repo.increment_applied(db, rule)
        kind = "vendor+address" if rule.match_context else "vendor"
        logger.info("Classification rule matched: rule_id=%s kind=%s -> %s", rule.id, kind, rule.category)
        return rule.category, rule.property_id, rule.activity_id

    if email_sender:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "sender", email_sender,
        )
        if rule:
            await classification_rule_repo.increment_applied(db, rule)
            logger.info(
                "Classification rule matched: rule_id=%s kind=sender -> %s",
                rule.id, rule.category,
            )
            return rule.category, rule.property_id, rule.activity_id

    if filename:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "filename", filename,
        )
        if rule:
            await classification_rule_repo.increment_applied(db, rule)
            logger.info(
                "Classification rule matched: rule_id=%s kind=filename -> %s",
                rule.id, rule.category,
            )
            return rule.category, rule.property_id, rule.activity_id

    return None


async def find_vendor_rule(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str | None,
    address: str | None = None,
) -> ClassificationRule | None:
    """The payee rule for this vendor: one for this vendor at this address first, then one for the vendor."""
    if not vendor or not normalize_vendor(vendor):
        return None
    if address:
        rule = await classification_rule_repo.get_matching_rule(
            db, organization_id, "vendor", vendor, context=address,
        )
        if rule:
            return rule
    return await classification_rule_repo.get_matching_rule(db, organization_id, "vendor", vendor)
