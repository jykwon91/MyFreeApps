"""Repository for ``lease_template_placeholders``."""
from __future__ import annotations

import uuid

from sqlalchemy import delete as _sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder


async def create(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    key: str,
    display_label: str,
    input_type: str,
    required: bool,
    default_source: str | None,
    computed_expr: str | None,
    display_order: int,
) -> LeaseTemplatePlaceholder:
    row = LeaseTemplatePlaceholder(
        template_id=template_id,
        key=key,
        display_label=display_label,
        input_type=input_type,
        required=required,
        default_source=default_source,
        computed_expr=computed_expr,
        display_order=display_order,
    )
    db.add(row)
    await db.flush()
    return row


async def list_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> list[LeaseTemplatePlaceholder]:
    result = await db.execute(
        select(LeaseTemplatePlaceholder)
        .where(LeaseTemplatePlaceholder.template_id == template_id)
        .order_by(LeaseTemplatePlaceholder.display_order.asc())
    )
    return list(result.scalars().all())


async def get_by_id_scoped_to_template(
    db: AsyncSession,
    *,
    placeholder_id: uuid.UUID,
    template_id: uuid.UUID,
) -> LeaseTemplatePlaceholder | None:
    """Return the placeholder iff it belongs to ``template_id``.

    Both IDs must match — prevents IDOR via leaked placeholder IDs paired
    with valid own-tenant template IDs.
    """
    result = await db.execute(
        select(LeaseTemplatePlaceholder).where(
            LeaseTemplatePlaceholder.id == placeholder_id,
            LeaseTemplatePlaceholder.template_id == template_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_all_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> None:
    await db.execute(
        _sa_delete(LeaseTemplatePlaceholder).where(
            LeaseTemplatePlaceholder.template_id == template_id,
        )
    )
