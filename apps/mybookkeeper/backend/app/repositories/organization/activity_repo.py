import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.activity import Activity


async def create(
    db: AsyncSession,
    organization_id: uuid.UUID,
    label: str,
    activity_type: str,
    tax_form: str,
    property_id: uuid.UUID | None = None,
) -> Activity:
    activity = Activity(
        organization_id=organization_id,
        label=label,
        activity_type=activity_type,
        tax_form=tax_form,
        property_id=property_id,
    )
    db.add(activity)
    await db.flush()
    return activity


async def get_by_id(
    db: AsyncSession, activity_id: uuid.UUID, organization_id: uuid.UUID
) -> Activity | None:
    result = await db.execute(
        select(Activity).where(
            Activity.id == activity_id,
            Activity.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_property_id(
    db: AsyncSession, property_id: uuid.UUID
) -> Activity | None:
    result = await db.execute(
        select(Activity).where(Activity.property_id == property_id)
    )
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession, organization_id: uuid.UUID
) -> Sequence[Activity]:
    result = await db.execute(
        select(Activity)
        .where(Activity.organization_id == organization_id)
        .order_by(Activity.created_at)
    )
    return result.scalars().all()


async def list_active_self_employment(
    db: AsyncSession, organization_id: uuid.UUID,
) -> list[Activity]:
    """Return active self-employment activities for Schedule C computation."""
    result = await db.execute(
        select(Activity).where(
            Activity.organization_id == organization_id,
            Activity.activity_type == "self_employment",
            Activity.is_active.is_(True),
        )
    )
    return list(result.scalars().all())


_UPDATABLE_FIELDS = frozenset({"label", "is_active"})


async def update(db: AsyncSession, activity: Activity, **kwargs: object) -> Activity:
    for key, value in kwargs.items():
        if key not in _UPDATABLE_FIELDS:
            raise ValueError(f"Cannot update field: {key}")
        setattr(activity, key, value)
    await db.flush()
    return activity


async def delete(db: AsyncSession, activity: Activity) -> None:
    await db.delete(activity)
