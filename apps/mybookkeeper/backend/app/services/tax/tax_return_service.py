"""Tax return CRUD and field operations."""
import logging
import uuid
from decimal import Decimal

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.pii import mask_pii
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import (
    document_repo,
    property_repo,
    booking_statement_repo,
    tax_form_repo,
    tax_return_repo,
    transaction_repo,
)
from app.schemas.tax.source_document import (
    ChecklistItem,
    SourceDocumentsResponse,
    TaxSourceDocument,
)

logger = logging.getLogger(__name__)


async def list_returns(ctx: RequestContext) -> list[TaxReturn]:
    async with AsyncSessionLocal() as db:
        returns = await tax_return_repo.list_for_org(db, ctx.organization_id)
        return list(returns)


async def create_return(
    ctx: RequestContext,
    tax_year: int,
    filing_status: str = "single",
    jurisdiction: str = "federal",
) -> TaxReturn:
    async with unit_of_work() as db:
        existing = await tax_return_repo.get_by_org_year(
            db, ctx.organization_id, tax_year, jurisdiction,
        )
        if existing:
            raise ValueError(f"Tax return for {tax_year} ({jurisdiction}) already exists")

        return await tax_return_repo.create_return(
            db,
            organization_id=ctx.organization_id,
            tax_year=tax_year,
            filing_status=filing_status,
            jurisdiction=jurisdiction,
        )


async def get_return(
    ctx: RequestContext, return_id: uuid.UUID
) -> TaxReturn | None:
    async with AsyncSessionLocal() as db:
        return await tax_return_repo.get_by_id_with_forms(
            db, return_id, ctx.organization_id,
        )


async def delete_return(
    ctx: RequestContext, return_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(db, return_id, ctx.organization_id)
        if not tax_return:
            return False
        await tax_return_repo.delete(db, tax_return)
        return True


async def get_forms_overview(
    ctx: RequestContext, return_id: uuid.UUID,
) -> list[dict]:
    """Return distinct form names with instance and field counts."""
    async with AsyncSessionLocal() as db:
        tax_return = await tax_return_repo.get_by_id(db, return_id, ctx.organization_id)
        if not tax_return:
            raise LookupError("Tax return not found")
        return await tax_form_repo.get_forms_overview(db, return_id)


async def get_form_instances(
    ctx: RequestContext, return_id: uuid.UUID, form_name: str, *, mask: bool = True
) -> dict:
    """Get all instances + fields for one form. Chrome extension endpoint shape."""
    async with AsyncSessionLocal() as db:
        tax_return = await tax_return_repo.get_by_id(
            db, return_id, ctx.organization_id,
        )
        if not tax_return:
            raise LookupError("Tax return not found")

        instances = await tax_return_repo.get_form_instances(
            db, return_id, form_name,
        )

        result_instances = []
        for inst in instances:
            fields = []
            for f in inst.fields:
                value = f.value_numeric if f.value_numeric is not None else f.value_text
                if value is None:
                    value = f.value_boolean
                field_type = "numeric" if f.value_numeric is not None else (
                    "boolean" if f.value_boolean is not None else "text"
                )
                resolved_value = float(f.value_numeric) if f.value_numeric is not None else value
                label = (
                    f.field_label
                    if f.field_label != f.field_id
                    else f.field_id.replace("_", " ").title()
                )
                fields.append({
                    "field_id": f.field_id,
                    "label": label,
                    "value": mask_pii(f.field_id, resolved_value) if mask else resolved_value,
                    "type": field_type,
                    "is_calculated": f.is_calculated,
                    "is_overridden": f.is_overridden,
                    "validation_status": f.validation_status,
                    "validation_message": f.validation_message,
                    "confidence": f.confidence,
                    "id": str(f.id),
                })

            result_instances.append({
                "instance_id": str(inst.id),
                "instance_label": inst.instance_label,
                "property_id": str(inst.property_id) if inst.property_id else None,
                "source_type": inst.source_type,
                "document_id": str(inst.document_id) if inst.document_id else None,
                "issuer_name": inst.issuer_name,
                "fields": fields,
            })

        return {
            "form_name": form_name,
            "instances": result_instances,
        }


async def override_field(
    ctx: RequestContext,
    return_id: uuid.UUID,
    field_id: uuid.UUID,
    *,
    value_numeric: Decimal | None = None,
    value_text: str | None = None,
    value_boolean: bool | None = None,
    override_reason: str | None = None,
) -> TaxFormField:
    """Manual override of a computed field value."""
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(
            db, return_id, ctx.organization_id,
        )
        if not tax_return:
            raise LookupError("Tax return not found")

        field = await tax_return_repo.get_field_by_id_with_instance(db, field_id)
        if not field:
            raise LookupError("Field not found")
        if field.form_instance.tax_return_id != return_id:
            raise LookupError("Field does not belong to this tax return")

        if value_numeric is not None:
            field.value_numeric = value_numeric
        if value_text is not None:
            field.value_text = value_text
        if value_boolean is not None:
            field.value_boolean = value_boolean
        field.is_overridden = True
        if override_reason:
            field.override_reason = override_reason

        return field


# Mapping of form type -> the field_id that represents the "key amount"
_KEY_AMOUNT_FIELDS: dict[str, str] = {
    "w2": "wages_tips_compensation",
    "1099_int": "interest_income",
    "1099_div": "total_ordinary_dividends",
    "1099_k": "gross_amount",
    "1099_misc": "box_1",
    "1099_nec": "nonemployee_compensation",
    "1099_r": "gross_distribution",
    "1098": "mortgage_interest_received",
    "1099_b": "proceeds",
    "k1": "ordinary_business_income",
}

# Tax form types that come from source documents (not computed forms)
_EXTRACTED_FORM_TYPES = frozenset({
    "w2", "1099_int", "1099_div", "1099_b", "1099_k",
    "1099_misc", "1099_nec", "1099_r", "1098", "k1",
})


async def list_all_source_documents(
    ctx: RequestContext, *, tax_year: int | None = None
) -> SourceDocumentsResponse:
    """Return all source documents across all tax returns for an org, with checklist."""
    async with AsyncSessionLocal() as db:
        # Find all tax returns for the org, optionally filtered by year
        returns = await tax_return_repo.list_for_org(db, ctx.organization_id)
        if tax_year:
            returns = [r for r in returns if r.tax_year == tax_year]

        if not returns:
            return SourceDocumentsResponse(documents=[], checklist=[])

        # Aggregate source documents and checklists across all returns
        all_documents: list[TaxSourceDocument] = []
        all_checklist: list[ChecklistItem] = []
        seen_instance_ids: set[uuid.UUID] = set()
        seen_checklist_keys: set[tuple[str, str | None]] = set()

        for tax_return in returns:
            response = await _get_source_documents_for_return(
                db, ctx, tax_return,
            )
            for doc in response.documents:
                inst_id = doc.form_instance_id
                if inst_id not in seen_instance_ids:
                    seen_instance_ids.add(inst_id)
                    all_documents.append(doc)

            for item in response.checklist:
                key = (item.expected_type, item.expected_from)
                if key not in seen_checklist_keys:
                    seen_checklist_keys.add(key)
                    all_checklist.append(item)

        return SourceDocumentsResponse(
            documents=all_documents,
            checklist=all_checklist,
        )


async def get_source_documents(
    ctx: RequestContext, return_id: uuid.UUID
) -> SourceDocumentsResponse:
    """Return all source documents linked to a tax return + completeness checklist."""
    async with AsyncSessionLocal() as db:
        tax_return = await tax_return_repo.get_by_id(
            db, return_id, ctx.organization_id,
        )
        if not tax_return:
            raise LookupError("Tax return not found")

        return await _get_source_documents_for_return(db, ctx, tax_return)


async def _get_source_documents_for_return(
    db: AsyncSession, ctx: RequestContext, tax_return: TaxReturn,
) -> SourceDocumentsResponse:
    """Core logic: build source documents + checklist for one tax return."""
    tax_year = tax_return.tax_year

    # -- Fetch all form instances with their fields eagerly loaded --
    instances = await tax_return_repo.get_all_form_instances(db, tax_return.id)

    # Batch-fetch all documents referenced by instances to avoid N+1
    doc_ids = [
        inst.document_id for inst in instances
        if inst.document_id and inst.form_name in _EXTRACTED_FORM_TYPES
    ]
    doc_map = await document_repo.get_by_ids(db, doc_ids)

    # Build source documents list from instances that have a document_id
    documents: list[TaxSourceDocument] = []
    received_map: dict[tuple[str, str | None], TaxSourceDocument] = {}

    for inst in instances:
        if not inst.document_id or inst.form_name not in _EXTRACTED_FORM_TYPES:
            continue

        doc = doc_map.get(inst.document_id)
        if not doc:
            continue

        # Find key amount from the instance's fields
        key_amount: float | None = None
        key_field_id = _KEY_AMOUNT_FIELDS.get(inst.form_name)
        if key_field_id:
            for field in inst.fields:
                if field.field_id == key_field_id and field.value_numeric is not None:
                    key_amount = float(field.value_numeric)
                    break

        masked_ein = mask_pii("issuer_ein", inst.issuer_ein)
        source_doc = TaxSourceDocument(
            document_id=doc.id,
            file_name=doc.file_name,
            document_type=inst.form_name,
            issuer_name=inst.issuer_name,
            issuer_ein=str(masked_ein) if masked_ein is not None else None,
            tax_year=tax_year,
            key_amount=key_amount,
            source=doc.source,
            uploaded_at=doc.created_at,
            form_instance_id=inst.id,
        )
        documents.append(source_doc)
        received_map[(inst.form_name, inst.issuer_name)] = source_doc

    # -- Build completeness checklist --
    checklist: list[ChecklistItem] = []

    # 1. Reservations -> expect 1099-K per unique platform, BUT only if
    #    the platform pays the owner directly. If a PM handles the payouts
    #    (indicated by management_fee transactions), the platform sends the
    #    1099-K to the PM, not the owner.
    mgmt_fee_count = await transaction_repo.count_by_category(
        db, ctx.organization_id, tax_year, "management_fee"
    )
    has_pm = mgmt_fee_count > 0

    if not has_pm:
        # No PM — platforms pay owner directly, expect 1099-Ks
        platforms = await booking_statement_repo.distinct_platforms_for_year(
            db, ctx.organization_id, tax_year
        )

        for platform in platforms:
            platform_label = platform.title() if platform else None
            match = _find_received(received_map, "1099_k", platform_label)
            checklist.append(ChecklistItem(
                expected_type="1099_k",
                expected_from=platform_label,
                reason=f"Reservations found on {platform_label} platform",
                status="received" if match else "missing",
                document_id=match.document_id if match else None,
            ))

    # 2. Management fee transactions -> expect 1099-MISC per vendor
    mgmt_vendors = await transaction_repo.distinct_vendors_by_category(
        db, ctx.organization_id, tax_year, "management_fee"
    )

    for vendor in mgmt_vendors:
        match = _find_received(received_map, "1099_misc", vendor)
        checklist.append(ChecklistItem(
            expected_type="1099_misc",
            expected_from=vendor,
            reason="Management fee transactions found",
            status="received" if match else "missing",
            document_id=match.document_id if match else None,
        ))

    # 3. Mortgage interest transactions -> expect 1098 per property
    mortgage_property_ids = await transaction_repo.distinct_property_ids_by_category(
        db, ctx.organization_id, tax_year, "mortgage_interest"
    )

    for prop_id in mortgage_property_ids:
        prop = await property_repo.get_by_id(db, prop_id, ctx.organization_id)
        prop_name = prop.name if prop else None
        match = _find_received(received_map, "1098", None)
        checklist.append(ChecklistItem(
            expected_type="1098",
            expected_from=None,
            reason=f"Mortgage interest transactions exist for {prop_name}" if prop_name else "Mortgage interest transactions found",
            status="received" if match else "missing",
            document_id=match.document_id if match else None,
        ))

    return SourceDocumentsResponse(
        documents=documents,
        checklist=checklist,
    )


def _find_received(
    received_map: dict[tuple[str, str | None], TaxSourceDocument],
    form_type: str,
    issuer_hint: str | None,
) -> TaxSourceDocument | None:
    """Try to find a received document matching form type and optionally issuer name."""
    # Exact match first
    if (form_type, issuer_hint) in received_map:
        return received_map[(form_type, issuer_hint)]
    # Try case-insensitive partial match on issuer_name
    if issuer_hint:
        hint_lower = issuer_hint.lower()
        for (ft, issuer), doc in received_map.items():
            if ft == form_type and issuer and hint_lower in issuer.lower():
                return doc
    # Any match on form_type with no specific issuer
    for (ft, _), doc in received_map.items():
        if ft == form_type:
            return doc
    return None


async def delete_instance(
    ctx: RequestContext,
    return_id: uuid.UUID,
    instance_id: uuid.UUID,
) -> bool:
    """Delete a tax form instance and all its fields (cascade)."""
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(
            db, return_id, ctx.organization_id,
        )
        if not tax_return:
            return False

        instance = await tax_form_repo.get_instance(db, instance_id)
        if not instance or instance.tax_return_id != return_id:
            return False

        await tax_form_repo.delete_instance(db, instance)
        return True
