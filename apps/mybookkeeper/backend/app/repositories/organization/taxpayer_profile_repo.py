import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.taxpayer_profile import TaxpayerProfile


async def get_by_org(
    db: AsyncSession,
    organization_id: uuid.UUID,
    filer_type: str,
) -> TaxpayerProfile | None:
    result = await db.execute(
        select(TaxpayerProfile).where(
            TaxpayerProfile.organization_id == organization_id,
            TaxpayerProfile.filer_type == filer_type,
        )
    )
    return result.scalar_one_or_none()


async def upsert(db: AsyncSession, profile: TaxpayerProfile) -> TaxpayerProfile:
    existing = await get_by_org(db, profile.organization_id, profile.filer_type)
    if existing:
        # Only overwrite columns that have a non-None value on the incoming profile
        # to prevent partial updates from erasing existing fields
        for col in (
            "encrypted_ssn",
            "encrypted_first_name",
            "encrypted_last_name",
            "encrypted_middle_initial",
            "encrypted_date_of_birth",
            "encrypted_street_address",
            "encrypted_apartment_unit",
            "encrypted_city",
            "encrypted_state",
            "encrypted_zip_code",
            "encrypted_phone",
            "encrypted_occupation",
            "ssn_last_four",
        ):
            new_value = getattr(profile, col)
            if new_value is not None:
                setattr(existing, col, new_value)
        await db.flush()
        return existing

    db.add(profile)
    await db.flush()
    return profile


async def delete_by_org(
    db: AsyncSession,
    organization_id: uuid.UUID,
    filer_type: str,
) -> bool:
    profile = await get_by_org(db, organization_id, filer_type)
    if not profile:
        return False
    await db.delete(profile)
    await db.flush()
    return True
