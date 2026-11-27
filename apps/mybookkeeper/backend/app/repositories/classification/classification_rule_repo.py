import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vendors import normalize_address, normalize_vendor
from app.models.classification.classification_rule import ClassificationRule
from app.models.classification.classification_rule_split_property import ClassificationRuleSplitProperty
from app.schemas.classification.rule_filing import RuleFiling


def _normalize_pattern(match_type: str, pattern: str) -> str:
    if match_type == "vendor":
        return normalize_vendor(pattern)
    return pattern.strip().lower()


def _normalize_context(match_type: str, context: str | None) -> str | None:
    if not context:
        return None
    if match_type == "vendor":
        return normalize_address(context)
    return context.strip().lower()


def _vendor_pattern_filter(normalized: str):
    """Build a WHERE clause for vendor fuzzy matching.

    For vendor rules, the stored match_pattern (e.g., "a to z") should be
    contained within the normalized vendor name (e.g., "a to z complete home
    maintenance repair"). This enables fuzzy matching where short rule names
    match longer extracted vendor names.
    """
    return literal(normalized).contains(ClassificationRule.match_pattern)


async def get_matching_rule(
    db: AsyncSession,
    organization_id: uuid.UUID,
    match_type: str,
    pattern: str,
    context: str | None = None,
) -> ClassificationRule | None:
    normalized = _normalize_pattern(match_type, pattern)
    if not normalized:
        return None

    # For vendor rules, use contains matching (fuzzy); for other types, use exact match
    use_fuzzy = match_type == "vendor"
    pattern_clause = (
        _vendor_pattern_filter(normalized) if use_fuzzy
        else ClassificationRule.match_pattern == normalized
    )

    if context:
        norm_ctx = _normalize_context(match_type, context)
        if norm_ctx:
            stmt = (
                select(ClassificationRule)
                .where(
                    ClassificationRule.organization_id == organization_id,
                    ClassificationRule.match_type == match_type,
                    pattern_clause,
                    ClassificationRule.match_context == norm_ctx,
                    ClassificationRule.is_active.is_(True),
                )
                .order_by(ClassificationRule.priority.desc())
                .limit(1)
            )
            result = await db.execute(stmt)
            specific = result.scalar_one_or_none()
            if specific:
                return specific

    stmt = (
        select(ClassificationRule)
        .where(
            ClassificationRule.organization_id == organization_id,
            ClassificationRule.match_type == match_type,
            pattern_clause,
            ClassificationRule.match_context.is_(None),
            ClassificationRule.is_active.is_(True),
        )
        .order_by(ClassificationRule.priority.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def upsert_rule(
    db: AsyncSession,
    organization_id: uuid.UUID,
    match_type: str,
    pattern: str,
    category: str,
    created_by: uuid.UUID,
    source: str = "user_correction",
    context: str | None = None,
    property_id: uuid.UUID | None = None,
    activity_id: uuid.UUID | None = None,
    keep_assignment_when_unset: bool = False,
    filing: RuleFiling | None = None,
) -> ClassificationRule:
    """Create the rule, or update the one with the same match.

    ``filing`` (a rule the person set up) also sets the scope and the split;
    without it (a rule learned from a correction) those stay as they are,
    except that learning a property ends a split.
    """
    normalized = _normalize_pattern(match_type, pattern)
    norm_ctx = _normalize_context(match_type, context)

    existing = await _find_exact_rule(db, organization_id, match_type, normalized, norm_ctx)
    if existing:
        existing.category = category
        if property_id is not None or not keep_assignment_when_unset:
            existing.property_id = property_id
        if activity_id is not None or not keep_assignment_when_unset:
            existing.activity_id = activity_id
        existing.source = source
        existing.updated_at = datetime.now(timezone.utc)
        if filing is not None:
            existing.transaction_scope = filing.transaction_scope
            await replace_split_properties(db, existing, filing.split_property_ids)
        elif existing.property_id is not None and existing.split_properties:
            await replace_split_properties(db, existing, [])
        await db.flush()
        return existing

    rule = ClassificationRule(
        organization_id=organization_id,
        match_type=match_type,
        match_pattern=normalized,
        match_context=norm_ctx,
        category=category,
        property_id=property_id,
        activity_id=activity_id,
        created_by=created_by,
        source=source,
        transaction_scope=filing.transaction_scope if filing else None,
        # Set, so reading it after the flush doesn't need a lazy load.
        split_properties=[],
    )
    db.add(rule)
    await db.flush()
    if filing is not None and filing.split_property_ids:
        await replace_split_properties(db, rule, filing.split_property_ids)
    return rule


async def replace_split_properties(
    db: AsyncSession, rule: ClassificationRule, property_ids: Sequence[uuid.UUID],
) -> None:
    """Make these, in this order, the properties the rule splits across."""
    # Deleted before the new ones go in: a flush inserts first, and a kept
    # property would hit uq_rule_split_property.
    rule.split_properties.clear()
    await db.flush()
    rule.split_properties.extend(
        ClassificationRuleSplitProperty(property_id=property_id, position=position)
        for position, property_id in enumerate(property_ids)
    )
    await db.flush()


async def get_rule(
    db: AsyncSession, rule_id: uuid.UUID, organization_id: uuid.UUID,
) -> ClassificationRule | None:
    result = await db.execute(
        select(ClassificationRule).where(
            ClassificationRule.id == rule_id,
            ClassificationRule.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def _find_exact_rule(
    db: AsyncSession,
    organization_id: uuid.UUID,
    match_type: str,
    match_pattern: str,
    match_context: str | None,
) -> ClassificationRule | None:
    if match_context:
        result = await db.execute(
            select(ClassificationRule).where(
                ClassificationRule.organization_id == organization_id,
                ClassificationRule.match_type == match_type,
                ClassificationRule.match_pattern == match_pattern,
                ClassificationRule.match_context == match_context,
            )
        )
    else:
        result = await db.execute(
            select(ClassificationRule).where(
                ClassificationRule.organization_id == organization_id,
                ClassificationRule.match_type == match_type,
                ClassificationRule.match_pattern == match_pattern,
                ClassificationRule.match_context.is_(None),
            )
        )
    return result.scalar_one_or_none()


async def list_rules(
    db: AsyncSession,
    organization_id: uuid.UUID,
    match_type: str | None = None,
) -> Sequence[ClassificationRule]:
    stmt = select(ClassificationRule).where(
        ClassificationRule.organization_id == organization_id,
    )
    if match_type:
        stmt = stmt.where(ClassificationRule.match_type == match_type)
    stmt = stmt.order_by(ClassificationRule.match_type, ClassificationRule.priority.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def delete_rule(
    db: AsyncSession,
    rule_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        select(ClassificationRule).where(
            ClassificationRule.id == rule_id,
            ClassificationRule.organization_id == organization_id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        return False
    await db.delete(rule)
    await db.flush()
    return True


async def increment_applied(db: AsyncSession, rule: ClassificationRule) -> None:
    rule.times_applied = (rule.times_applied or 0) + 1
    await db.flush()
