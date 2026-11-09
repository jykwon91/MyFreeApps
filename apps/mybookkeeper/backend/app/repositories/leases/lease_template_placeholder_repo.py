"""Repository for ``lease_template_placeholders``."""
from __future__ import annotations

import uuid

from sqlalchemy import delete as _sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder
from app.schemas.leases.placeholder_spec import PlaceholderSpec


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


async def list_specs_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> list[PlaceholderSpec]:
    """The template's placeholders as plain values, safe to hold across a delete."""
    return [
        PlaceholderSpec(
            key=row.key,
            display_label=row.display_label,
            input_type=row.input_type,
            required=row.required,
            default_source=row.default_source,
            computed_expr=row.computed_expr,
            display_order=row.display_order,
        )
        for row in await list_for_template(db, template_id=template_id)
    ]


async def create_many(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    specs: list[PlaceholderSpec],
) -> None:
    for spec in specs:
        await create(
            db,
            template_id=template_id,
            key=spec.key,
            display_label=spec.display_label,
            input_type=spec.input_type,
            required=spec.required,
            default_source=spec.default_source,
            computed_expr=spec.computed_expr,
            display_order=spec.display_order,
        )


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


# Allowlist for ``update_fields`` — anything not in here is silently ignored.
_UPDATABLE_FIELDS: frozenset[str] = frozenset({
    "display_label",
    "input_type",
    "required",
    "default_source",
    "computed_expr",
    "display_order",
})


async def update_fields(
    db: AsyncSession,
    *,
    placeholder: LeaseTemplatePlaceholder,
    fields: dict[str, object],
) -> LeaseTemplatePlaceholder:
    """Apply field-by-field updates and flush. Allowlisted fields only.

    The service layer is responsible for additional validation (e.g.
    computed_expr DSL) before calling this.
    """
    for key, value in fields.items():
        if key not in _UPDATABLE_FIELDS:
            continue
        setattr(placeholder, key, value)
    await db.flush()
    return placeholder
