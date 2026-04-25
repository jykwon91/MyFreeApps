import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vendors import normalize_address, normalize_vendor
from app.models.classification.classification_rule import ClassificationRule


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
) -> ClassificationRule:
    normalized = _normalize_pattern(match_type, pattern)
    norm_ctx = _normalize_context(match_type, context)

    existing = await _find_exact_rule(db, organization_id, match_type, normalized, norm_ctx)
    if existing:
        existing.category = category
        existing.property_id = property_id
        existing.activity_id = activity_id
        existing.source = source
        existing.updated_at = datetime.now(timezone.utc)
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
    )
    db.add(rule)
    await db.flush()
    return rule


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
