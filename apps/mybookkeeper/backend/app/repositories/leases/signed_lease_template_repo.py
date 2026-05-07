"""Repository for ``signed_lease_templates`` — the M:N join between
signed leases and the templates that contributed to them.

Per layered-architecture: services orchestrate, repositories own queries.
All queries by ``lease_id`` are tenant-scoped indirectly through the
caller (which fetches the lease via the tenant-scoped signed-lease repo
first).
"""
from __future__ import annotations

import uuid

from sqlalchemy import delete as _sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease_template import SignedLeaseTemplate


async def create(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    template_id: uuid.UUID,
    display_order: int,
) -> SignedLeaseTemplate:
    row = SignedLeaseTemplate(
        lease_id=lease_id,
        template_id=template_id,
        display_order=display_order,
    )
    db.add(row)
    await db.flush()
    return row


async def list_for_lease(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
) -> list[SignedLeaseTemplate]:
    """Return all template links for a lease, ordered by display_order."""
    result = await db.execute(
        select(SignedLeaseTemplate)
        .where(SignedLeaseTemplate.lease_id == lease_id)
        .order_by(
            SignedLeaseTemplate.display_order.asc(),
            SignedLeaseTemplate.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def list_template_ids_for_leases(
    db: AsyncSession,
    *,
    lease_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Return ``{lease_id: [template_id, ...]}`` for a batch of leases.

    Used by the list endpoint so each lease summary can expose its template
    list without an N+1 query.
    """
    if not lease_ids:
        return {}
    result = await db.execute(
        select(
            SignedLeaseTemplate.lease_id,
            SignedLeaseTemplate.template_id,
            SignedLeaseTemplate.display_order,
        )
        .where(SignedLeaseTemplate.lease_id.in_(lease_ids))
        .order_by(
            SignedLeaseTemplate.lease_id,
            SignedLeaseTemplate.display_order.asc(),
            SignedLeaseTemplate.created_at.asc(),
        )
    )
    out: dict[uuid.UUID, list[uuid.UUID]] = {lease_id: [] for lease_id in lease_ids}
    for lease_id, template_id, _ in result.all():
        out.setdefault(lease_id, []).append(template_id)
    return out


async def delete_all_for_lease(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
) -> None:
    await db.execute(
        _sa_delete(SignedLeaseTemplate).where(
            SignedLeaseTemplate.lease_id == lease_id,
        )
    )


async def has_active_lease_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> bool:
    """Return True when any non-deleted signed lease links to this template.

    Used by the soft-delete-template flow to enforce 409 on conflict. Joins
    against ``signed_leases`` to filter out soft-deleted parents.
    """
    from app.models.leases.signed_lease import SignedLease  # local import to avoid cycle

    result = await db.execute(
        select(func.count())
        .select_from(SignedLeaseTemplate)
        .join(SignedLease, SignedLease.id == SignedLeaseTemplate.lease_id)
        .where(
            SignedLeaseTemplate.template_id == template_id,
            SignedLease.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one()) > 0
