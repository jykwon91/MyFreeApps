"""Recording a lease's rendered documents, serialised on the lease row."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.schemas.leases.rendered_lease_file import RenderedLeaseFile

RENDERED_KIND = "rendered_original"


async def replace_rendered_original(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    files: list[RenderedLeaseFile],
    replace_existing: bool,
    uploaded_at: _dt.datetime,
) -> list[str] | None:
    """Record ``files`` as the lease's rendered documents.

    The lease row is locked first, so concurrent generates and regenerates run
    one after the other and cannot duplicate documents. With ``replace_existing``
    every current ``rendered_original`` row, as it stands under the lock, is
    deleted; their storage keys are returned for removal after the commit.
    Other attachment kinds are untouched. Returns ``None`` if the lease is gone.
    """
    lease = await signed_lease_repo.get(
        db,
        lease_id=lease_id,
        user_id=user_id,
        organization_id=organization_id,
        for_update=True,
    )
    if lease is None:
        return None
    superseded: list[str] = []
    if replace_existing:
        for attachment in await signed_lease_attachment_repo.list_by_lease(db, lease_id):
            if attachment.kind == RENDERED_KIND:
                await signed_lease_attachment_repo.delete_by_id_scoped_to_lease(
                    db, attachment_id=attachment.id, lease_id=lease_id,
                )
                superseded.append(attachment.storage_key)
    for file in files:
        await signed_lease_attachment_repo.create(
            db,
            lease_id=lease_id,
            storage_key=file.storage_key,
            filename=file.filename,
            content_type=file.content_type,
            size_bytes=file.size_bytes,
            kind=RENDERED_KIND,
            uploaded_by_user_id=user_id,
            uploaded_at=uploaded_at,
        )
    return superseded
