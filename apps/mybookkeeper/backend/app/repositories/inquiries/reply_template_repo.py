"""Repository for ``reply_templates`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Templates are scoped per-user
(not org-shared in PR 2.3 — see RENTALS_PLAN.md §13 OUT OF SCOPE).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import asc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.reply_template import ReplyTemplate

# Allowlist of columns updatable via PATCH /reply-templates/{id}. Tenant
# scoping (organization_id, user_id) and server-managed columns (id,
# created_at, updated_at) are deliberately excluded.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "name",
    "subject_template",
    "body_template",
    "display_order",
    "is_archived",
})


async def get_by_id_and_user(
    db: AsyncSession,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ReplyTemplate | None:
    """Return the template iff it exists and belongs to the given user."""
    result = await db.execute(
        select(ReplyTemplate).where(
            ReplyTemplate.id == template_id,
            ReplyTemplate.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def find_by_user_and_name(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
) -> ReplyTemplate | None:
    """Lookup by (user_id, name) for idempotent default-template seeding."""
    result = await db.execute(
        select(ReplyTemplate).where(
            ReplyTemplate.user_id == user_id,
            ReplyTemplate.name == name,
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    include_archived: bool = False,
) -> list[ReplyTemplate]:
    """List templates for a user, ordered by display_order then name.

    The org filter is applied even though user_id alone is sufficient — it
    matches the tenant-scoping convention (every read is org-scoped) and
    catches the hypothetical case where a user belongs to multiple orgs and
    has templates in only one of them.
    """
    stmt = select(ReplyTemplate).where(
        ReplyTemplate.organization_id == organization_id,
        ReplyTemplate.user_id == user_id,
    )
    if not include_archived:
        stmt = stmt.where(ReplyTemplate.is_archived.is_(False))
    stmt = stmt.order_by(
        asc(ReplyTemplate.display_order),
        asc(ReplyTemplate.name),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    subject_template: str,
    body_template: str,
    display_order: int = 0,
) -> ReplyTemplate:
    template = ReplyTemplate(
        organization_id=organization_id,
        user_id=user_id,
        name=name,
        subject_template=subject_template,
        body_template=body_template,
        display_order=display_order,
    )
    db.add(template)
    await db.flush()
    return template


async def update_template(
    db: AsyncSession,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    fields: dict[str, Any],
) -> ReplyTemplate | None:
    """Apply allowlisted updates. Returns None if not found / wrong user."""
    template = await get_by_id_and_user(db, template_id, user_id)
    if template is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return template
    for key, value in safe_fields.items():
        setattr(template, key, value)
    await db.flush()
    return template


async def archive(
    db: AsyncSession,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Soft-delete: set is_archived=true. Returns True iff a row was updated."""
    result = await db.execute(
        update(ReplyTemplate)
        .where(
            ReplyTemplate.id == template_id,
            ReplyTemplate.user_id == user_id,
            ReplyTemplate.is_archived.is_(False),
        )
        .values(
            is_archived=True,
            updated_at=_dt.datetime.now(_dt.timezone.utc),
        )
    )
    return (result.rowcount or 0) > 0
