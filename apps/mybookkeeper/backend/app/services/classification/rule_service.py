"""CRUD operations for classification rules, and filing past payments by a payee rule."""
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.payee_rule_constants import MAX_PAST_MATCHES, RULE_PAST_ONLY_PAYEES, RULE_PROPERTY_NOT_FOUND
from app.core.vendors import normalize_address
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.classification.classification_rule import ClassificationRule
from app.models.transactions.transaction import Transaction
from app.repositories.classification import classification_rule_repo, payee_rule_match_repo
from app.repositories.properties import property_repo
from app.schemas.classification.rule_filing import RuleFiling
from app.services.classification import rule_actions
from app.services.classification.payee_rule_error import PayeeRuleError
from app.services.transactions.foreign_reference_error import ForeignReferenceError
from app.services.transactions.reference_ownership import assert_references_owned

_PAYEE_MATCH_TYPE = "vendor"


async def list_rules(
    organization_id: uuid.UUID,
    match_type: str | None = None,
) -> Sequence[ClassificationRule]:
    async with AsyncSessionLocal() as db:
        return await classification_rule_repo.list_rules(db, organization_id, match_type)


async def create_rule(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    data: dict,
) -> ClassificationRule:
    async with unit_of_work() as db:
        # Every transaction the rule later matches inherits these, so a foreign
        # id here would spread across the tenant boundary on each extraction.
        await assert_references_owned(
            db,
            organization_id=organization_id,
            user_id=user_id,
            fields={
                "property_id": data.get("property_id"),
                "activity_id": data.get("activity_id"),
            },
        )
        split_property_ids: list[uuid.UUID] = data.get("split_property_ids") or []
        owned = await property_repo.get_name_map(db, organization_id)
        if any(property_id not in owned for property_id in split_property_ids):
            raise ForeignReferenceError(RULE_PROPERTY_NOT_FOUND)
        return await classification_rule_repo.upsert_rule(
            db,
            organization_id=organization_id,
            match_type=data["match_type"],
            pattern=data["match_pattern"],
            category=data["category"],
            created_by=user_id,
            source="manual",
            context=data.get("match_context"),
            property_id=data.get("property_id"),
            activity_id=data.get("activity_id"),
            filing=RuleFiling(
                transaction_scope=data.get("transaction_scope"),
                split_property_ids=split_property_ids,
            ),
        )


async def delete_rule(
    rule_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        return await classification_rule_repo.delete_rule(db, rule_id, organization_id)


async def _past_rows_to_refile(
    db: AsyncSession, rule: ClassificationRule, *, lock: bool,
) -> list[Transaction]:
    if rule.match_type != _PAYEE_MATCH_TYPE:
        raise PayeeRuleError(RULE_PAST_ONLY_PAYEES)
    rows = await payee_rule_match_repo.list_unfiled_from_payee(
        db, rule.organization_id, rule.match_pattern, limit=MAX_PAST_MATCHES, lock=lock,
    )
    return [
        row for row in rows
        if (rule.match_context is None or normalize_address(row.address) == rule.match_context)
        and rule_actions.would_refile(rule, row)
    ]


async def count_past_matches(rule_id: uuid.UUID, organization_id: uuid.UUID) -> int | None:
    """How many past payments the rule would refile; None when there's no such rule."""
    async with AsyncSessionLocal() as db:
        rule = await classification_rule_repo.get_rule(db, rule_id, organization_id)
        if rule is None:
            return None
        return len(await _past_rows_to_refile(db, rule, lock=False))


async def apply_to_past(rule_id: uuid.UUID, organization_id: uuid.UUID) -> int | None:
    """Refile, once, the past payments the rule matches that no person filed; None when there's no such rule."""
    async with unit_of_work() as db:
        rule = await classification_rule_repo.get_rule(db, rule_id, organization_id)
        if rule is None:
            return None
        applied = 0
        for row in await _past_rows_to_refile(db, rule, lock=True):
            if await rule_actions.file_by_rule(db, row, rule):
                applied += 1
        return applied
