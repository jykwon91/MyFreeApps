import uuid

from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.organization.activity import Activity
from app.models.properties.property import Property
from app.models.properties.property_classification import PropertyClassification
from app.repositories import activity_repo
from app.services.properties.property_service import CLASSIFICATION_TO_ACTIVITY

UPDATABLE_FIELDS = frozenset({"label", "is_active"})


async def create_activity(
    ctx: RequestContext,
    label: str,
    activity_type: str,
    tax_form: str,
    property_id: uuid.UUID | None = None,
) -> Activity:
    async with unit_of_work() as db:
        return await activity_repo.create(
            db,
            organization_id=ctx.organization_id,
            label=label,
            activity_type=activity_type,
            tax_form=tax_form,
            property_id=property_id,
        )


async def create_activity_for_property(
    ctx: RequestContext,
    prop: Property,
) -> Activity:
    classification = getattr(prop, "classification", PropertyClassification.UNCLASSIFIED)
    activity_type, tax_form = CLASSIFICATION_TO_ACTIVITY.get(
        classification.value, ("unclassified", "schedule_e"),
    )
    return await create_activity(
        ctx,
        label=prop.name,
        activity_type=activity_type,
        tax_form=tax_form,
        property_id=prop.id,
    )


async def list_activities(ctx: RequestContext) -> list[Activity]:
    async with AsyncSessionLocal() as db:
        result = await activity_repo.list_for_org(db, ctx.organization_id)
        return list(result)


async def get_activity(
    ctx: RequestContext, activity_id: uuid.UUID
) -> Activity | None:
    async with AsyncSessionLocal() as db:
        return await activity_repo.get_by_id(db, activity_id, ctx.organization_id)


async def update_activity(
    ctx: RequestContext,
    activity_id: uuid.UUID,
    updates: dict[str, str | bool | None],
) -> Activity | None:
    async with unit_of_work() as db:
        activity = await activity_repo.get_by_id(db, activity_id, ctx.organization_id)
        if not activity:
            return None
        for field, value in updates.items():
            if field not in UPDATABLE_FIELDS:
                raise ValueError(f"Cannot update field: {field}")
            setattr(activity, field, value)
        return activity


async def delete_activity(
    ctx: RequestContext, activity_id: uuid.UUID
) -> bool:
    async with unit_of_work() as db:
        activity = await activity_repo.get_by_id(db, activity_id, ctx.organization_id)
        if not activity:
            return False
        await activity_repo.delete(db, activity)
        return True
