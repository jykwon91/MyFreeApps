import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn


async def get_or_create_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> TaxReturn:
    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.organization_id == organization_id,
            TaxReturn.tax_year == tax_year,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    tax_return = TaxReturn(
        organization_id=organization_id,
        tax_year=tax_year,
    )
    db.add(tax_return)
    await db.flush()
    return tax_return


async def list_by_org(
    db: AsyncSession, organization_id: uuid.UUID
) -> Sequence[TaxReturn]:
    result = await db.execute(
        select(TaxReturn)
        .where(TaxReturn.organization_id == organization_id)
        .order_by(TaxReturn.tax_year.desc())
    )
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession, tax_return_id: uuid.UUID, organization_id: uuid.UUID
) -> TaxReturn | None:
    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.id == tax_return_id,
            TaxReturn.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def update(db: AsyncSession, tax_return: TaxReturn) -> TaxReturn:
    await db.flush()
    return tax_return


async def delete(db: AsyncSession, tax_return: TaxReturn) -> None:
    await db.delete(tax_return)


async def set_needs_recompute(
    db: AsyncSession, tax_return: TaxReturn, value: bool = True
) -> None:
    tax_return.needs_recompute = value
    await db.flush()


async def create_return(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    tax_year: int,
    filing_status: str = "single",
    jurisdiction: str = "federal",
) -> TaxReturn:
    tax_return = TaxReturn(
        organization_id=organization_id,
        tax_year=tax_year,
        filing_status=filing_status,
        jurisdiction=jurisdiction,
    )
    db.add(tax_return)
    await db.flush()
    return tax_return


async def get_by_id_with_forms(
    db: AsyncSession, return_id: uuid.UUID, organization_id: uuid.UUID
) -> TaxReturn | None:
    result = await db.execute(
        select(TaxReturn)
        .where(
            TaxReturn.id == return_id,
            TaxReturn.organization_id == organization_id,
        )
        .options(selectinload(TaxReturn.form_instances))
    )
    return result.scalar_one_or_none()


async def get_by_org_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    jurisdiction: str = "federal",
) -> TaxReturn | None:
    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.organization_id == organization_id,
            TaxReturn.tax_year == tax_year,
            TaxReturn.jurisdiction == jurisdiction,
        )
    )
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession, organization_id: uuid.UUID
) -> Sequence[TaxReturn]:
    result = await db.execute(
        select(TaxReturn)
        .where(TaxReturn.organization_id == organization_id)
        .order_by(TaxReturn.tax_year.desc())
    )
    return result.scalars().all()


async def get_form_instances(
    db: AsyncSession, tax_return_id: uuid.UUID, form_name: str
) -> Sequence[TaxFormInstance]:
    result = await db.execute(
        select(TaxFormInstance)
        .where(
            TaxFormInstance.tax_return_id == tax_return_id,
            TaxFormInstance.form_name == form_name,
        )
        .options(
            selectinload(TaxFormInstance.fields).selectinload(TaxFormField.sources),
        )
    )
    return result.scalars().all()


async def get_all_form_instances(
    db: AsyncSession, tax_return_id: uuid.UUID
) -> Sequence[TaxFormInstance]:
    result = await db.execute(
        select(TaxFormInstance)
        .where(TaxFormInstance.tax_return_id == tax_return_id)
        .options(
            selectinload(TaxFormInstance.fields).selectinload(TaxFormField.sources),
        )
    )
    return result.scalars().all()


async def upsert_form_instance(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
    form_name: str,
    source_type: str,
    *,
    property_id: uuid.UUID | None = None,
    instance_label: str | None = None,
) -> TaxFormInstance:
    stmt = select(TaxFormInstance).where(
        TaxFormInstance.tax_return_id == tax_return_id,
        TaxFormInstance.form_name == form_name,
        TaxFormInstance.source_type == source_type,
    )
    if property_id is not None:
        stmt = stmt.where(TaxFormInstance.property_id == property_id)
    else:
        stmt = stmt.where(TaxFormInstance.property_id.is_(None))

    result = await db.execute(stmt)
    instance = result.scalar_one_or_none()

    if instance:
        if instance_label is not None:
            instance.instance_label = instance_label
        return instance

    instance = TaxFormInstance(
        tax_return_id=tax_return_id,
        form_name=form_name,
        source_type=source_type,
        property_id=property_id,
        instance_label=instance_label,
    )
    db.add(instance)
    await db.flush()
    return instance


async def upsert_field(
    db: AsyncSession,
    form_instance_id: uuid.UUID,
    field_id: str,
    field_label: str,
    *,
    value_numeric: Decimal | None = None,
    value_text: str | None = None,
    value_boolean: bool | None = None,
    is_calculated: bool = False,
) -> TaxFormField:
    result = await db.execute(
        select(TaxFormField).where(
            TaxFormField.form_instance_id == form_instance_id,
            TaxFormField.field_id == field_id,
        )
    )
    field = result.scalar_one_or_none()

    if field:
        if not field.is_overridden:
            field.value_numeric = value_numeric
            field.value_text = value_text
            field.value_boolean = value_boolean
            field.is_calculated = is_calculated
        return field

    field = TaxFormField(
        form_instance_id=form_instance_id,
        field_id=field_id,
        field_label=field_label,
        value_numeric=value_numeric,
        value_text=value_text,
        value_boolean=value_boolean,
        is_calculated=is_calculated,
    )
    db.add(field)
    await db.flush()
    return field


async def replace_field_sources(
    db: AsyncSession,
    field_id: uuid.UUID,
    sources: list[TaxFormFieldSource],
) -> None:
    result = await db.execute(
        select(TaxFormFieldSource).where(TaxFormFieldSource.field_id == field_id)
    )
    for existing in result.scalars().all():
        await db.delete(existing)
    await db.flush()
    for source in sources:
        db.add(source)
    await db.flush()


async def get_field_by_id(
    db: AsyncSession, field_id: uuid.UUID
) -> TaxFormField | None:
    result = await db.execute(
        select(TaxFormField).where(TaxFormField.id == field_id)
    )
    return result.scalar_one_or_none()


async def get_field_by_id_with_instance(
    db: AsyncSession, field_id: uuid.UUID
) -> TaxFormField | None:
    result = await db.execute(
        select(TaxFormField)
        .where(TaxFormField.id == field_id)
        .options(selectinload(TaxFormField.form_instance))
    )
    return result.scalar_one_or_none()


async def get_w2_instances_with_fields(
    db: AsyncSession,
    organization_id: uuid.UUID,
    year: int,
) -> Sequence[TaxFormInstance]:
    """Return all W-2 TaxFormInstances for the given org/year, with fields eagerly loaded."""
    return_result = await db.execute(
        select(TaxReturn.id)
        .where(TaxReturn.organization_id == organization_id, TaxReturn.tax_year == year)
    )
    return_ids = [row[0] for row in return_result.all()]
    if not return_ids:
        return []

    result = await db.execute(
        select(TaxFormInstance)
        .where(
            TaxFormInstance.tax_return_id.in_(return_ids),
            TaxFormInstance.form_name == "w2",
        )
        .options(selectinload(TaxFormInstance.fields))
    )
    return result.scalars().all()
