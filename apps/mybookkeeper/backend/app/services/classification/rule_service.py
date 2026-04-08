"""CRUD operations for classification rules."""
import uuid
from collections.abc import Sequence

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.classification.classification_rule import ClassificationRule
from app.repositories.classification import classification_rule_repo


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
        )


async def delete_rule(
    rule_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        return await classification_rule_repo.delete_rule(db, rule_id, organization_id)
