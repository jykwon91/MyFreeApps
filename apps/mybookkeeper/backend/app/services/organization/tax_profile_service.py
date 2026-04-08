import uuid
from datetime import datetime, timezone

from app.db.session import unit_of_work
from app.models.organization.tax_profile import TaxProfile
from app.repositories import tax_profile_repo, tax_year_profile_repo

UPDATABLE_FIELDS = frozenset({"tax_situations", "dependents_count"})


async def get_or_create_profile(organization_id: uuid.UUID) -> TaxProfile:
    async with unit_of_work() as db:
        return await tax_profile_repo.get_or_create(db, organization_id)


async def update_profile(
    organization_id: uuid.UUID,
    updates: dict[str, object],
) -> TaxProfile:
    async with unit_of_work() as db:
        profile = await tax_profile_repo.get_or_create(db, organization_id)
        for field, value in updates.items():
            if field not in UPDATABLE_FIELDS:
                raise ValueError(f"Cannot update field: {field}")
            setattr(profile, field, value)
        return profile


async def complete_onboarding(
    organization_id: uuid.UUID,
    tax_situations: list[str],
    filing_status: str,
    dependents_count: int,
) -> TaxProfile:
    current_year = datetime.now(timezone.utc).year
    async with unit_of_work() as db:
        profile = await tax_profile_repo.get_or_create(db, organization_id)
        profile.tax_situations = tax_situations
        profile.dependents_count = dependents_count
        profile.onboarding_completed = True

        year_profile = await tax_year_profile_repo.get_or_create(
            db, organization_id, current_year,
        )
        year_profile.filing_status = filing_status
        year_profile.dependents_count = dependents_count

        return profile
