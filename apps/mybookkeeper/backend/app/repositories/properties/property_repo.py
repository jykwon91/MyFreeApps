import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.properties.property import Property


async def list_by_org(db: AsyncSession, organization_id: uuid.UUID) -> Sequence[Property]:
    result = await db.execute(
        select(Property)
        .options(selectinload(Property.activity_periods))
        .where(Property.organization_id == organization_id)
    )
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession, property_id: uuid.UUID, organization_id: uuid.UUID
) -> Property | None:
    result = await db.execute(
        select(Property)
        .options(selectinload(Property.activity_periods))
        .where(
            Property.id == property_id,
            Property.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_name(
    db: AsyncSession, organization_id: uuid.UUID, name: str
) -> Property | None:
    result = await db.execute(
        select(Property).where(
            Property.organization_id == organization_id,
            func.lower(Property.name) == name.lower(),
        )
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, prop: Property) -> Property:
    db.add(prop)
    await db.flush()
    return prop


async def delete(db: AsyncSession, prop: Property) -> None:
    await db.delete(prop)


async def get_name_map(
    db: AsyncSession, organization_id: uuid.UUID
) -> dict[uuid.UUID, str]:
    result = await db.execute(
        select(Property.id, Property.name).where(
            Property.organization_id == organization_id,
        )
    )
    return {row.id: row.name for row in result.all()}


async def get_labels_by_ids(
    db: AsyncSession, property_ids: list[uuid.UUID],
) -> dict[uuid.UUID, str]:
    """Return {property_id: address_or_name} for a set of property IDs."""
    if not property_ids:
        return {}
    result = await db.execute(
        select(Property.id, Property.name, Property.address).where(
            Property.id.in_(property_ids)
        )
    )
    return {
        prop.id: (prop.address or prop.name)
        for prop in result.all()
    }


async def get_classifications_by_ids(
    db: AsyncSession, property_ids: list[uuid.UUID],
) -> dict[uuid.UUID, str]:
    """Return {property_id: classification_name} for a set of property IDs."""
    if not property_ids:
        return {}
    result = await db.execute(
        select(Property.id, Property.classification).where(
            Property.id.in_(property_ids)
        )
    )
    return {
        row.id: row.classification.name if row.classification else "UNCLASSIFIED"
        for row in result.all()
    }


async def list_depreciable(
    db: AsyncSession, organization_id: uuid.UUID,
) -> list[Property]:
    """Return properties with a purchase price and a date_placed_in_service set."""
    result = await db.execute(
        select(Property).where(
            Property.organization_id == organization_id,
            Property.purchase_price.isnot(None),
            Property.date_placed_in_service.isnot(None),
        )
    )
    return list(result.scalars().all())


async def list_active_with_purchase_price(
    db: AsyncSession, organization_id: uuid.UUID,
) -> list[Property]:
    """Return active properties that have a purchase price set."""
    result = await db.execute(
        select(Property).where(
            Property.organization_id == organization_id,
            Property.purchase_price.isnot(None),
            Property.is_active.is_(True),
        )
    )
    return list(result.scalars().all())


async def list_active(
    db: AsyncSession, organization_id: uuid.UUID,
) -> list[Property]:
    """Return all active properties for an organization."""
    result = await db.execute(
        select(Property).where(
            Property.organization_id == organization_id,
            Property.is_active.is_(True),
        )
    )
    return list(result.scalars().all())
