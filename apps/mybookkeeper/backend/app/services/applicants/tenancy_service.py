"""Service for tenant lifecycle operations.

Tenants are applicants at stage=``lease_signed``. This service handles:
- Listing tenants (with optional include_ended toggle)
- Ending a tenancy (PATCH /applicants/{id}/tenancy/end)
- Restarting a tenancy (PATCH /applicants/{id}/tenancy/restart)

The ``is_ended`` predicate is computed at read-time:
  tenant_ended_at IS NOT NULL OR (contract_end IS NOT NULL AND contract_end < today)

No background jobs required.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.db.session import unit_of_work, AsyncSessionLocal
from app.repositories.applicants import applicant_event_repo, applicant_repo
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.schemas.applicants.applicant_summary import ApplicantSummary
from app.schemas.applicants.tenant_list_response import TenantListResponse
from app.services.applicants import applicant_service


class NotATenantError(ValueError):
    """The applicant is not at stage=lease_signed."""


class TenancyAlreadyEndedError(ValueError):
    """The tenancy is already ended (tenant_ended_at is set)."""


class TenancyNotEndedError(ValueError):
    """The tenancy is not ended — cannot restart."""


async def list_tenants(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    include_ended: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> TenantListResponse:
    """List applicants at stage=lease_signed."""
    async with AsyncSessionLocal() as db:
        rows = await applicant_repo.list_tenants(
            db,
            organization_id=organization_id,
            user_id=user_id,
            include_ended=include_ended,
            limit=limit,
            offset=offset,
        )
        total = await applicant_repo.count_tenants(
            db,
            organization_id=organization_id,
            user_id=user_id,
            include_ended=include_ended,
        )
    items = [ApplicantSummary.model_validate(row) for row in rows]
    has_more = (offset + len(items)) < total
    return TenantListResponse(items=items, total=total, has_more=has_more)


async def end_tenancy(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    reason: str | None,
) -> ApplicantDetailResponse:
    """Mark a tenant's tenancy as ended.

    Raises:
        LookupError: applicant not found in the calling tenant.
        NotATenantError: applicant is not at stage=lease_signed.
    """
    now = _dt.datetime.now(_dt.timezone.utc)

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")

        if applicant.stage != "lease_signed":
            raise NotATenantError(
                f"Applicant is at stage '{applicant.stage}', not 'lease_signed'. "
                "Only tenants (stage=lease_signed) can have their tenancy ended."
            )

        await applicant_repo.set_tenancy_ended(
            db,
            applicant=applicant,
            reason=reason,
            now=now,
        )

        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="tenancy_ended",
            actor="host",
            occurred_at=now,
            payload={"reason": reason},
        )

    return await applicant_service.get_applicant(
        organization_id, user_id, applicant_id,
    )


async def restart_tenancy(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> ApplicantDetailResponse:
    """Clear a manually-ended tenancy.

    Raises:
        LookupError: applicant not found in the calling tenant.
        NotATenantError: applicant is not at stage=lease_signed.
        TenancyNotEndedError: tenancy was not manually ended (contract_end
            expiry is not reversible this way — host must update the date).
    """
    now = _dt.datetime.now(_dt.timezone.utc)

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")

        if applicant.stage != "lease_signed":
            raise NotATenantError(
                f"Applicant is at stage '{applicant.stage}', not 'lease_signed'."
            )

        if applicant.tenant_ended_at is None:
            raise TenancyNotEndedError(
                "This tenancy was not manually ended. "
                "If the contract_end date has passed, update the date to extend."
            )

        await applicant_repo.clear_tenancy_ended(
            db,
            applicant=applicant,
            now=now,
        )

        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="tenancy_restarted",
            actor="host",
            occurred_at=now,
            payload=None,
        )

    return await applicant_service.get_applicant(
        organization_id, user_id, applicant_id,
    )
