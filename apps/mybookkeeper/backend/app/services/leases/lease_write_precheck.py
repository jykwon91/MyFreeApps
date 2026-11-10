"""Lock a lease and confirm nothing the render depended on has changed.

Documents are rendered from an unlocked read. Before they are written the lease
is locked and re-read; if the linked templates, values or dates differ from
what was rendered the write is abandoned (``LeaseChangedDuringRenderError``) and
the caller's guard removes the new objects. The decision is never patched up
under the lock.

Lock order across the lease paths is always lease, then template.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import signed_lease_repo, signed_lease_template_repo
from app.services.leases._lease_helpers import SignedLeaseNotFoundError
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
) -> None:
    lease = await signed_lease_repo.get(
        db, lease_id=lease_id, user_id=user_id, organization_id=organization_id, for_update=True,
    )
    if lease is None:
        raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
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
