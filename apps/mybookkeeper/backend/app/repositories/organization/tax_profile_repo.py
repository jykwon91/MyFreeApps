import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.tax_profile import TaxProfile


async def get_or_create(
    db: AsyncSession, organization_id: uuid.UUID
) -> TaxProfile:
    result = await db.execute(
        select(TaxProfile).where(
            TaxProfile.organization_id == organization_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    profile = TaxProfile(organization_id=organization_id)
    db.add(profile)
    await db.flush()
    return profile


async def get_by_org(
    db: AsyncSession, organization_id: uuid.UUID
) -> TaxProfile | None:
    result = await db.execute(
        select(TaxProfile).where(
            TaxProfile.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


_UPDATABLE_FIELDS: frozenset[str] = frozenset({"tax_situations", "dependents_count"})


async def update(db: AsyncSession, profile: TaxProfile, **kwargs: object) -> TaxProfile:
    for key, value in kwargs.items():
        if key not in _UPDATABLE_FIELDS:
            raise ValueError(f"Field '{key}' is not updatable on TaxProfile")
        setattr(profile, key, value)
    await db.flush()
    return profile
