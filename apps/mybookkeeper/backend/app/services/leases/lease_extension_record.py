"""The rows one lease extension writes: the addendum, the term versions, the
new end date and the tenant's event."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.repositories.applicants import applicant_event_repo, applicant_repo
from app.repositories.leases import (
    lease_term_version_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
)


async def record_extension(
    db: AsyncSession,
    *,
    lease: SignedLease,
    applicant: Applicant | None,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    attachment_id: uuid.UUID,
    storage_key: str,
    pdf_size: int,
    original_starts_on: _dt.date,
    original_ends_on: _dt.date,
    new_ends_on: _dt.date,
    now: _dt.datetime,
) -> None:
    """The addendum attachment, the term versions, the new end date and the event."""
    lease_id = lease.id
    attachment = await signed_lease_attachment_repo.create(
        db,
        id=attachment_id,
        lease_id=lease.id,
        storage_key=storage_key,
        filename=_addendum_filename(new_ends_on),
        content_type="application/pdf",
        size_bytes=pdf_size,
        kind="signed_addendum",
        uploaded_by_user_id=user_id,
        uploaded_at=now,
    )

    # Undo returns to the seed. The backfill only covered leases that
    # existed when the table arrived, so later ones get theirs here.
    # A lease already extended without one keeps none: its current end
    # date is not its original term.
    if not await lease_term_version_repo.list_by_lease(db, lease_id=lease.id):
        await lease_term_version_repo.create(
            db,
            lease_id=lease.id,
            starts_on=original_starts_on,
            ends_on=original_ends_on,
            source_attachment_id=None,
            created_by_user_id=user_id,
            created_at=now,
        )

    extension = await lease_term_version_repo.create(
        db,
        lease_id=lease.id,
        starts_on=original_starts_on,
        ends_on=new_ends_on,
        source_attachment_id=attachment.id,
        created_by_user_id=user_id,
        created_at=now,
    )

    await signed_lease_repo.update_lease(
        db,
        lease_id=lease_id,
        user_id=user_id,
        organization_id=organization_id,
        fields={"ends_on": new_ends_on, "updated_at": now},
    )

    if applicant is not None:
        tenancy_restarted = applicant.tenant_ended_at is not None
        ended_tenancy = None
        if tenancy_restarted:
            # Undo needs these to put the end back; clearing wipes them.
            ended_tenancy = {
                "ended_at": applicant.tenant_ended_at.isoformat(),
                "reason": applicant.tenant_ended_reason,
            }
            await applicant_repo.clear_tenancy_ended(
                db, applicant=applicant, now=now,
            )
        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="tenancy_extended",
            actor="host",
            occurred_at=now,
            payload={
                "lease_id": str(lease_id),
                "previous_ends_on": original_ends_on.isoformat(),
                "new_ends_on": new_ends_on.isoformat(),
                "tenancy_restarted": tenancy_restarted,
                "lease_term_version_id": str(extension.id),
                "ended_tenancy": ended_tenancy,
            },
        )


def _addendum_filename(new_ends_on: _dt.date) -> str:
    return f"Lease Extension Addendum - through {new_ends_on.isoformat()}.pdf"
