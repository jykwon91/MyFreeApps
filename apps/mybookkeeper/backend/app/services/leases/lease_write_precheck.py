"""Lock a lease and confirm nothing the render depended on has changed.

Documents are rendered from an unlocked read. Before they are written the lease
is locked and re-read; if the linked templates, values or dates differ from
what was rendered the write is abandoned (``LeaseChangedDuringRenderError``) and
the caller's guard removes the new objects. The decision is never patched up
under the lock.

The lock check runs under the same row lock. A write that replaces
already-rendered documents (``rerenders_documents``) needs the lease still
unlocked; any other write is abandoned if the lease locked since the read (it
was planned against values that were still open to change). The lease locks
when its status moves past generated, when a tenant email starts sending (the
sender stamps ``last_emailed_to_tenant_at`` under this same lock before it
reads any file), or when a signed copy is attached, so none of those can be
overtaken by a render that read the lease earlier.

Lock order across the lease paths is always lease, then template.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import signed_lease_repo, signed_lease_template_repo
from app.services.leases._lease_helpers import SignedLeaseNotFoundError
from app.services.leases.lease_documents_lock import ensure_documents_rerenderable, lease_documents_locked
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)


async def lock_lease_and_verify(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    rendered_template_ids: set[uuid.UUID],
    rendered_values: dict[str, Any],
    rendered_starts_on: _dt.date | None,
    rendered_ends_on: _dt.date | None,
    rerenders_documents: bool,
    locked_at_read: bool,
) -> None:
    lease = await signed_lease_repo.get(
        db, lease_id=lease_id, user_id=user_id, organization_id=organization_id, for_update=True,
    )
    if lease is None:
        raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
    if rerenders_documents:
        await ensure_documents_rerenderable(db, lease)
    elif await lease_documents_locked(db, lease) and not locked_at_read:
        # Locked since the read, so values planned for saving are no longer allowed.
        raise LeaseChangedDuringRenderError(f"Lease {lease_id} changed while rendering")
    linked = {
        r.template_id for r in await signed_lease_template_repo.list_for_lease(db, lease_id=lease_id)
    }
    if (
        linked != rendered_template_ids
        or dict(lease.values or {}) != rendered_values
        or lease.starts_on != rendered_starts_on
        or lease.ends_on != rendered_ends_on
    ):
        raise LeaseChangedDuringRenderError(f"Lease {lease_id} changed while rendering")
