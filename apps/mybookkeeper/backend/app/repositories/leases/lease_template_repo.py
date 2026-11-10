"""Repository for ``lease_templates`` — owns every query against the table.

Per layered-architecture: routes never touch the ORM, services orchestrate,
repositories return ORM rows. All public functions filter by ``user_id`` AND
``organization_id`` (the project's tenant-isolation convention).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_template import LeaseTemplate


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    name: str,
    description: str | None = None,
    template_id: uuid.UUID | None = None,
) -> LeaseTemplate:
    """``template_id`` lets a caller fix the id up front (e.g. to name storage
    objects before the row exists); omitted, the model default generates one."""
    template = LeaseTemplate(
        **({"id": template_id} if template_id is not None else {}),
        user_id=user_id,
        organization_id=organization_id,
        name=name,
        description=description,
    )
    db.add(template)
    await db.flush()
    return template


async def get(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
    for_update: bool = False,
) -> LeaseTemplate | None:
    stmt = select(LeaseTemplate).where(
        LeaseTemplate.id == template_id,
        LeaseTemplate.user_id == user_id,
        LeaseTemplate.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(LeaseTemplate.deleted_at.is_(None))
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_tenant(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[LeaseTemplate]:
    stmt = select(LeaseTemplate).where(
        LeaseTemplate.user_id == user_id,
        LeaseTemplate.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(LeaseTemplate.deleted_at.is_(None))
    stmt = stmt.order_by(desc(LeaseTemplate.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_tenant(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
) -> int:
    stmt = select(func.count()).select_from(LeaseTemplate).where(
        LeaseTemplate.user_id == user_id,
        LeaseTemplate.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(LeaseTemplate.deleted_at.is_(None))
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def update_metadata(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    name: str | None = None,
    description: str | None = None,
) -> LeaseTemplate | None:
    template = await get(
        db,
        template_id=template_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if template is None:
        return None
    if name is not None:
        template.name = name
    if description is not None:
        template.description = description
    await db.flush()
    return template


async def bump_version(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Increment the version in SQL so concurrent bumps cannot lose one."""
    result = await db.execute(
        update(LeaseTemplate)
        .where(
            LeaseTemplate.id == template_id,
            LeaseTemplate.user_id == user_id,
            LeaseTemplate.organization_id == organization_id,
            LeaseTemplate.deleted_at.is_(None),
        )
        .values(version=LeaseTemplate.version + 1)
        .execution_options(synchronize_session=False)
    )
    return (result.rowcount or 0) > 0


async def list_by_ids(
    db: AsyncSession,
    *,
    template_ids: list[uuid.UUID],
) -> list[LeaseTemplate]:
    """Bulk-load templates by ID in a single IN-list query.

    Used by services that need to resolve multiple templates at once
    (e.g. multi-template signed-lease detail view). Does NOT filter by
    tenant — the caller is responsible for tenant scoping (typically
    by walking from a tenant-scoped parent row first).
    """
    if not template_ids:
        return []
    result = await db.execute(
        select(LeaseTemplate).where(LeaseTemplate.id.in_(template_ids))
    )
    return list(result.scalars().all())


async def soft_delete(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        update(LeaseTemplate)
        .where(
            LeaseTemplate.id == template_id,
            LeaseTemplate.user_id == user_id,
            LeaseTemplate.organization_id == organization_id,
            LeaseTemplate.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0


async def hard_delete_by_id(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Hard-delete a template, soft-deleted or not. Returns whether a row was
    deleted. Test cleanup only — production deletes are soft.

    Files and placeholders cascade. A signed lease generated from the template
    is ``RESTRICT``: delete the lease first or this raises ``IntegrityError``.
    """
    result = await db.execute(
        delete(LeaseTemplate).where(
            LeaseTemplate.id == template_id,
            LeaseTemplate.user_id == user_id,
            LeaseTemplate.organization_id == organization_id,
        )
    )
    return (result.rowcount or 0) > 0
