import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax.tax_year_profile import TaxYearProfile


async def get_or_create(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int
) -> TaxYearProfile:
    result = await db.execute(
        select(TaxYearProfile).where(
            TaxYearProfile.organization_id == organization_id,
            TaxYearProfile.tax_year == tax_year,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    profile = TaxYearProfile(
        organization_id=organization_id,
        tax_year=tax_year,
    )
    db.add(profile)
    await db.flush()
    return profile


async def get_by_org_year(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int
) -> TaxYearProfile | None:
    result = await db.execute(
        select(TaxYearProfile).where(
            TaxYearProfile.organization_id == organization_id,
            TaxYearProfile.tax_year == tax_year,
        )
    )
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession, organization_id: uuid.UUID
) -> Sequence[TaxYearProfile]:
    result = await db.execute(
        select(TaxYearProfile)
        .where(TaxYearProfile.organization_id == organization_id)
        .order_by(TaxYearProfile.tax_year.desc())
    )
    return result.scalars().all()


_UPDATABLE_FIELDS = frozenset({
    "filing_status", "dependents_count", "property_use_days",
    "home_office_sqft", "home_total_sqft", "business_mileage",
})


async def update(
    db: AsyncSession, profile: TaxYearProfile, **kwargs: object
) -> TaxYearProfile:
    for key, value in kwargs.items():
        if key not in _UPDATABLE_FIELDS:
            raise ValueError(f"Cannot update field: {key}")
        setattr(profile, key, value)
    await db.flush()
    return profile
