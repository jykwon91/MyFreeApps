"""Taxpayer profile service — encrypts PII on write, decrypts on read."""
import logging
import uuid

from app.core.security import decrypt_pii, encrypt_pii
from app.db.session import unit_of_work
from app.models.organization.taxpayer_profile import TaxpayerProfile
from app.repositories.organization import taxpayer_profile_repo
from app.services.system.event_service import record_event

logger = logging.getLogger(__name__)

# Explicit allowlist of plaintext field names accepted on write.
_PLAINTEXT_FIELDS: frozenset[str] = frozenset({
    "ssn",
    "first_name",
    "last_name",
    "middle_initial",
    "date_of_birth",
    "street_address",
    "apartment_unit",
    "city",
    "state",
    "zip_code",
    "phone",
    "occupation",
})


def _mask_ssn(ssn_last_four: str | None) -> str | None:
    if ssn_last_four is None:
        return None
    return f"***-**-{ssn_last_four}"


def _decrypt_profile(profile: TaxpayerProfile, include_ssn: bool) -> dict:
    def _d(val: str | None) -> str | None:
        return decrypt_pii(val) if val else None

    ssn: str | None
    if include_ssn:
        ssn = _d(profile.encrypted_ssn)
    else:
        ssn = _mask_ssn(profile.ssn_last_four)

    return {
        "id": profile.id,
        "organization_id": profile.organization_id,
        "filer_type": profile.filer_type,
        "ssn_masked": ssn,
        "first_name": _d(profile.encrypted_first_name),
        "last_name": _d(profile.encrypted_last_name),
        "middle_initial": _d(profile.encrypted_middle_initial),
        "date_of_birth": _d(profile.encrypted_date_of_birth),
        "street_address": _d(profile.encrypted_street_address),
        "apartment_unit": _d(profile.encrypted_apartment_unit),
        "city": _d(profile.encrypted_city),
        "state": _d(profile.encrypted_state),
        "zip_code": _d(profile.encrypted_zip_code),
        "phone": _d(profile.encrypted_phone),
        "occupation": _d(profile.encrypted_occupation),
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


async def get_profile(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    filer_type: str,
    include_ssn: bool = False,
) -> dict | None:
    async with unit_of_work() as db:
        profile = await taxpayer_profile_repo.get_by_org(db, organization_id, filer_type)
        if not profile:
            return None
        result = _decrypt_profile(profile, include_ssn=include_ssn)

    await record_event(
        organization_id=organization_id,
        event_type="pii_access",
        severity="info",
        message=f"Taxpayer profile read: filer_type={filer_type} include_ssn={include_ssn}",
        data={"user_id": str(user_id), "filer_type": filer_type, "include_ssn": include_ssn},
    )
    return result


async def upsert_profile(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    filer_type: str,
    data: dict,
) -> dict:
    unknown = set(data.keys()) - _PLAINTEXT_FIELDS
    if unknown:
        raise ValueError(f"Unknown fields: {unknown}")

    def _e(val: str | None) -> str | None:
        return encrypt_pii(val) if val is not None else None

    ssn_raw: str | None = data.get("ssn")
    ssn_last_four: str | None = ssn_raw[-4:] if ssn_raw else None

    profile = TaxpayerProfile(
        organization_id=organization_id,
        filer_type=filer_type,
        encrypted_ssn=_e(ssn_raw),
        encrypted_first_name=_e(data.get("first_name")),
        encrypted_last_name=_e(data.get("last_name")),
        encrypted_middle_initial=_e(data.get("middle_initial")),
        encrypted_date_of_birth=_e(data.get("date_of_birth")),
        encrypted_street_address=_e(data.get("street_address")),
        encrypted_apartment_unit=_e(data.get("apartment_unit")),
        encrypted_city=_e(data.get("city")),
        encrypted_state=_e(data.get("state")),
        encrypted_zip_code=_e(data.get("zip_code")),
        encrypted_phone=_e(data.get("phone")),
        encrypted_occupation=_e(data.get("occupation")),
        ssn_last_four=ssn_last_four,
    )

    async with unit_of_work() as db:
        saved = await taxpayer_profile_repo.upsert(db, profile)
        result = _decrypt_profile(saved, include_ssn=False)

    await record_event(
        organization_id=organization_id,
        event_type="pii_write",
        severity="info",
        message=f"Taxpayer profile upserted: filer_type={filer_type}",
        data={"user_id": str(user_id), "filer_type": filer_type},
    )
    return result


async def delete_profile(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    filer_type: str,
) -> bool:
    async with unit_of_work() as db:
        deleted = await taxpayer_profile_repo.delete_by_org(db, organization_id, filer_type)

    if deleted:
        await record_event(
            organization_id=organization_id,
            event_type="pii_delete",
            severity="info",
            message=f"Taxpayer profile deleted: filer_type={filer_type}",
            data={"user_id": str(user_id), "filer_type": filer_type},
        )
    return deleted
