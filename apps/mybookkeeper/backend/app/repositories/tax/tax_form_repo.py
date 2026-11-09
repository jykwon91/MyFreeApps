import uuid
from collections.abc import Sequence
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_form_instance import TaxFormInstance


async def get_forms_overview(
    db: AsyncSession, tax_return_id: uuid.UUID,
) -> list[dict]:
    """Return distinct form names with instance and field counts for a tax return."""
    result = await db.execute(
        select(
            TaxFormInstance.form_name,
            func.count(TaxFormInstance.id.distinct()).label("instance_count"),
            func.count(TaxFormField.id).label("field_count"),
        )
        .outerjoin(TaxFormField, TaxFormField.form_instance_id == TaxFormInstance.id)
        .where(TaxFormInstance.tax_return_id == tax_return_id)
        .group_by(TaxFormInstance.form_name)
    )
    return [
        {"form_name": row.form_name, "instance_count": row.instance_count, "field_count": row.field_count}
        for row in result.all()
    ]


async def find_existing_instance(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
    form_name: str,
    document_id: uuid.UUID | None,
) -> TaxFormInstance | None:
    """Find an existing instance by source document (same doc re-extracted = update).

    Only matches by document_id — NOT by EIN alone. This allows multiple instances
    with the same EIN from different source documents (e.g., two 1098s from the
    same lender for different properties).
    """
    if document_id:
        result = await db.execute(
            select(TaxFormInstance).where(
                TaxFormInstance.tax_return_id == tax_return_id,
                TaxFormInstance.form_name == form_name,
                TaxFormInstance.document_id == document_id,
            )
        )
        return result.scalar_one_or_none()

    return None


async def create_instance(
    db: AsyncSession, instance: TaxFormInstance
) -> TaxFormInstance:
    db.add(instance)
    await db.flush()
    return instance


async def list_instances(
    db: AsyncSession, tax_return_id: uuid.UUID
) -> Sequence[TaxFormInstance]:
    result = await db.execute(
        select(TaxFormInstance)
        .where(TaxFormInstance.tax_return_id == tax_return_id)
        .order_by(TaxFormInstance.form_name, TaxFormInstance.created_at)
    )
    return result.scalars().all()


async def get_instance(
    db: AsyncSession, instance_id: uuid.UUID
) -> TaxFormInstance | None:
    result = await db.execute(
        select(TaxFormInstance).where(TaxFormInstance.id == instance_id)
    )
    return result.scalar_one_or_none()


async def create_field(
    db: AsyncSession, field: TaxFormField
) -> TaxFormField:
    db.add(field)
    await db.flush()
    return field


async def get_fields(
    db: AsyncSession, form_instance_id: uuid.UUID
) -> Sequence[TaxFormField]:
    result = await db.execute(
        select(TaxFormField)
        .where(TaxFormField.form_instance_id == form_instance_id)
        .order_by(TaxFormField.field_id)
    )
    return result.scalars().all()


VALUE_COLUMNS = ("value_numeric", "value_text", "value_boolean")


async def apply_override(
    db: AsyncSession,
    field: TaxFormField,
    *,
    column: str | None,
    value: Decimal | str | bool | None,
    reason: str,
    user_id: uuid.UUID,
) -> TaxFormField:
    """Hold `value` in `column` only; column=None clears the field."""
    if column is not None and column not in VALUE_COLUMNS:
        raise ValueError(f"Unknown value column: {column}")
    for name in VALUE_COLUMNS:
        setattr(field, name, None)
    if column is not None:
        setattr(field, column, value)
    now = datetime.now(timezone.utc)
    field.is_overridden = True
    field.override_reason = reason
    field.overridden_by = user_id
    field.overridden_at = now
    field.updated_at = now
    await db.flush()
    return field


async def create_field_source(
    db: AsyncSession, source: TaxFormFieldSource
) -> TaxFormFieldSource:
    db.add(source)
    await db.flush()
    return source


async def delete_instance(
    db: AsyncSession, instance: TaxFormInstance
) -> None:
    await db.delete(instance)
    await db.flush()


async def get_field_by_id(
    db: AsyncSession, field_id: uuid.UUID
) -> TaxFormField | None:
    result = await db.execute(
        select(TaxFormField).where(TaxFormField.id == field_id)
    )
    return result.scalar_one_or_none()
