import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.tax.tax_year_profile import TaxYearProfile
from app.repositories import tax_year_profile_repo

UPDATABLE_FIELDS = frozenset({
    "filing_status", "dependents_count", "property_use_days",
    "home_office_sqft", "home_total_sqft", "business_mileage",
})


async def get_or_create(
    organization_id: uuid.UUID, tax_year: int
) -> TaxYearProfile:
    async with unit_of_work() as db:
        return await tax_year_profile_repo.get_or_create(db, organization_id, tax_year)


async def update_profile(
    organization_id: uuid.UUID,
    tax_year: int,
    updates: dict[str, object],
) -> TaxYearProfile:
    async with unit_of_work() as db:
        profile = await tax_year_profile_repo.get_or_create(db, organization_id, tax_year)
        for field, value in updates.items():
            if field not in UPDATABLE_FIELDS:
                raise ValueError(f"Cannot update field: {field}")
            setattr(profile, field, value)
        return profile


async def list_for_org(organization_id: uuid.UUID) -> list[TaxYearProfile]:
    async with AsyncSessionLocal() as db:
        result = await tax_year_profile_repo.list_for_org(db, organization_id)
        return list(result)
