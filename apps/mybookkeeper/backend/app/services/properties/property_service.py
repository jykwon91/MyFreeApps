import logging
import uuid

from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.properties.property import Property, PropertyType
from app.models.properties.property_classification import PropertyClassification
from app.repositories import activity_repo, property_repo, tax_return_repo

logger = logging.getLogger(__name__)

UPDATABLE_FIELDS = frozenset({
    "name", "address", "classification", "type", "is_active",
    "purchase_price", "land_value", "date_placed_in_service",
    "property_class", "personal_use_days",
})

CLASSIFICATION_TO_ACTIVITY: dict[str, tuple[str, str]] = {
    "investment": ("rental_property", "schedule_e"),
    "primary_residence": ("primary_residence", "schedule_a"),
    "second_home": ("second_home", "schedule_a"),
    "unclassified": ("unclassified", "schedule_e"),
}


async def list_properties(ctx: RequestContext) -> list[Property]:
    async with AsyncSessionLocal() as db:
        result = await property_repo.list_by_org(db, ctx.organization_id)
        return list(result)


async def create_property(
    ctx: RequestContext,
    name: str,
    address: str,
    classification: PropertyClassification = PropertyClassification.UNCLASSIFIED,
    type: PropertyType | None = None,
) -> Property:
    async with unit_of_work() as db:
        existing = await property_repo.get_by_name(db, ctx.organization_id, name)
        if existing:
            raise ValueError(f"A property named '{name}' already exists")
        created = await property_repo.create_property(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            name=name,
            address=address,
            classification=classification,
            type=type,
        )
        activity_type, tax_form = CLASSIFICATION_TO_ACTIVITY.get(
            classification.value, ("unclassified", "schedule_e"),
        )
        await activity_repo.create(
            db,
            organization_id=ctx.organization_id,
            activity_type=activity_type,
            label=name,
            tax_form=tax_form,
            property_id=created.id,
        )
        return await property_repo.get_by_id(db, created.id, ctx.organization_id)  # type: ignore[return-value]


async def update_property(
    ctx: RequestContext,
    property_id: uuid.UUID,
    updates: dict,
) -> Property | None:
    async with unit_of_work() as db:
        prop = await property_repo.get_by_id(db, property_id, ctx.organization_id)
        if not prop:
            return None
        old_classification = prop.classification
        for field, value in updates.items():
            if field not in UPDATABLE_FIELDS:
                raise ValueError(f"Cannot update field: {field}")
            setattr(prop, field, value)

        # Cascade: when classification changes, update linked Activity and flag recompute
        new_classification = prop.classification
        if new_classification != old_classification:
            await _cascade_classification_change(
                db, ctx.organization_id, property_id, new_classification,
            )

        return prop


async def _cascade_classification_change(
    db,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
    new_classification: PropertyClassification,
) -> None:
    """Update linked Activity tax_form and flag tax returns for recompute."""
    activity_type, tax_form = CLASSIFICATION_TO_ACTIVITY.get(
        new_classification.value, ("unclassified", "schedule_e"),
    )

    activity = await activity_repo.get_by_property_id(db, property_id)
    if activity:
        activity.activity_type = activity_type
        activity.tax_form = tax_form
        logger.info(
            "Reclassified property %s -> %s (activity tax_form=%s)",
            property_id, new_classification.value, tax_form,
        )

    tax_returns = await tax_return_repo.list_by_org(db, organization_id)
    for tr in tax_returns:
        tr.needs_recompute = True


async def delete_property(
    ctx: RequestContext, property_id: uuid.UUID
) -> bool:
    async with unit_of_work() as db:
        prop = await property_repo.get_by_id(db, property_id, ctx.organization_id)
        if not prop:
            return False
        await property_repo.delete(db, prop)
        return True
