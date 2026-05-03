"""Repository for ``lease_templates`` — owns every query against the table.

Per layered-architecture: routes never touch the ORM, services orchestrate,
repositories return ORM rows. All public functions filter by ``user_id`` AND
``organization_id`` (the project's tenant-isolation convention).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_template import LeaseTemplate


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    name: str,
    description: str | None = None,
) -> LeaseTemplate:
    template = LeaseTemplate(
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
) -> LeaseTemplate | None:
    stmt = select(LeaseTemplate).where(
        LeaseTemplate.id == template_id,
        LeaseTemplate.user_id == user_id,
        LeaseTemplate.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(LeaseTemplate.deleted_at.is_(None))
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
) -> LeaseTemplate | None:
    template = await get(
        db,
        template_id=template_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if template is None:
        return None
    template.version = (template.version or 1) + 1
    await db.flush()
    return template


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
