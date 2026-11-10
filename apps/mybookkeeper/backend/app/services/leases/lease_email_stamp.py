"""Stamp a tenant email's start on the lease and on exactly the files it sends.

The lease's ``last_emailed_to_tenant_at`` is when the most recent tenant email
started. Each file's ``emailed_to_tenant_at`` says that this file was in one,
which is what keeps it locked (see ``lease_documents_lock``). Both are written
under the lease row lock, in the transaction that read the files to send.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.schemas.leases.tenant_email_stamps import TenantEmailStamps


async def stamp_email_start(
    db: AsyncSession,
    *,
    lease: SignedLease,
    files: Sequence[SignedLeaseAttachment],
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> TenantEmailStamps:
    now = _dt.datetime.now(_dt.timezone.utc)
    previous = TenantEmailStamps(
        stamped_at=now,
        lease_emailed_at=lease.last_emailed_to_tenant_at,
        files_emailed_at={f.id: f.emailed_to_tenant_at for f in files},
    )
    await signed_lease_repo.update_lease(
        db, lease_id=lease.id, user_id=user_id, organization_id=organization_id,
        fields={"last_emailed_to_tenant_at": now},
    )
    await signed_lease_attachment_repo.set_emailed_to_tenant_at(
        db, lease_id=lease.id, stamps={f.id: now for f in files},
    )
    return previous


async def restore_email_stamps(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    previous: TenantEmailStamps,
) -> None:
    """Nothing was sent, so the lease and its files go back to what they were.

    Under the lease row lock, and only where this email's stamp is still in
    place: another email that started in the meantime keeps its own stamps, so
    the files it sends stay locked.
    """
    lease = await signed_lease_repo.get(
        db, lease_id=lease_id, user_id=user_id, organization_id=organization_id, for_update=True,
    )
    if lease is None:
        return
    await signed_lease_repo.restore_last_emailed_if_unchanged(
        db, lease_id=lease_id, user_id=user_id, organization_id=organization_id,
        expected=previous.stamped_at, restore_to=previous.lease_emailed_at,
    )
    await signed_lease_attachment_repo.restore_emailed_to_tenant_at_if_unchanged(
        db, lease_id=lease_id, expected=previous.stamped_at, stamps=previous.files_emailed_at,
    )
