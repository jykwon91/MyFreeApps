"""Process tax source documents (W-2, 1099, 1098, K-1) into tax form tables."""
import logging
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.parsers import safe_decimal
from app.core.tax_form_fields import TAX_FORM_FIELD_DEFINITIONS, TAX_SOURCE_FORM_TYPES
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_form_instance import TaxFormInstance
from app.repositories import tax_return_repo, tax_form_repo

logger = logging.getLogger(__name__)


def is_tax_source_document(document_type: str) -> bool:
    return document_type in TAX_SOURCE_FORM_TYPES




async def process_tax_document(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    document_id: uuid.UUID | None,
    extraction_id: uuid.UUID | None,
    document_type: str,
    tax_form_data: dict,
) -> TaxFormInstance:
    """Create tax return, form instance, fields, and field sources from extraction.

    Args:
        db: Active database session (caller manages transaction).
        organization_id: Org that owns this document.
        document_id: The source document ID.
        extraction_id: The extraction record ID.
        document_type: The form type (e.g. "w2", "1099_int").
        tax_form_data: Parsed tax form data with keys:
            issuer_ein, issuer_name, tax_year, fields (dict of field_id -> value).
    """
    tax_year = tax_form_data.get("tax_year")
    if not tax_year or not isinstance(tax_year, int):
        raise ValueError("tax_form_data must include a valid integer tax_year")

    tax_return = await tax_return_repo.get_or_create_for_year(
        db, organization_id, tax_year,
    )

    field_defs = TAX_FORM_FIELD_DEFINITIONS.get(document_type, [])
    field_label_map = {fid: label for fid, label in field_defs}

    issuer_name = tax_form_data.get("issuer_name")
    issuer_ein = tax_form_data.get("issuer_ein")
    instance_label = issuer_name or document_type.upper()

    # Dedup: if the same source document was already extracted, skip
    existing = await tax_form_repo.find_existing_instance(
        db, tax_return.id, document_type, document_id,
    )
    if existing:
        logger.info(
            "Skipping duplicate %s instance for EIN=%s (existing id=%s)",
            document_type, issuer_ein, existing.id,
        )
        return existing

    instance = TaxFormInstance(
        tax_return_id=tax_return.id,
        form_name=document_type,
        instance_label=instance_label,
        source_type="extracted",
        document_id=document_id,
        extraction_id=extraction_id,
        issuer_ein=issuer_ein,
        issuer_name=issuer_name,
    )
    instance = await tax_form_repo.create_instance(db, instance)

    raw_fields = tax_form_data.get("fields", {})
    for field_id, raw_value in raw_fields.items():
        label = field_label_map.get(field_id, field_id)
        numeric_val = safe_decimal(raw_value)
        text_val: str | None = None
        bool_val: bool | None = None

        if numeric_val is not None:
            pass
        elif isinstance(raw_value, bool):
            bool_val = raw_value
        elif isinstance(raw_value, str):
            text_val = raw_value
        else:
            text_val = str(raw_value) if raw_value is not None else None

        if numeric_val is None and text_val is None and bool_val is None:
            continue

        field = TaxFormField(
            form_instance_id=instance.id,
            field_id=field_id,
            field_label=label,
            value_numeric=numeric_val,
            value_text=text_val,
            value_boolean=bool_val,
            confidence="high",
        )
        field = await tax_form_repo.create_field(db, field)

        source_amount = numeric_val if numeric_val is not None else Decimal("0")
        field_source = TaxFormFieldSource(
            field_id=field.id,
            source_type="manual" if document_id is None else "tax_form_instance",
            source_id=document_id,
            amount=source_amount,
            description=f"Extracted from {document_type} document",
        )
        await tax_form_repo.create_field_source(db, field_source)

    await tax_return_repo.set_needs_recompute(db, tax_return, value=True)

    return instance
