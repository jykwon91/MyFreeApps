"""Document checklist service — derives expected documents from user data.

For each tax return, loads properties, tax form instances, and transactions
to compute a checklist of what documents should exist vs what has been received.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.repositories import (
    document_repo,
    property_repo,
    tax_form_repo,
    tax_return_repo,
    transaction_repo,
)
from app.schemas.tax.document_checklist import ChecklistItem, DocumentChecklist

# Tax form types that come from source documents (not computed)
_EXTRACTED_FORM_TYPES = frozenset({
    "w2", "1099_int", "1099_div", "1099_b", "1099_k",
    "1099_misc", "1099_nec", "1099_r", "1098", "k1",
})

# document_type values set by the extraction pipeline for property support docs
_INSURANCE_DOC_TYPES = frozenset({"insurance_policy"})
_PROPERTY_TAX_DOC_TYPES = frozenset({"statement", "invoice"})


async def get_checklist(
    organization_id: uuid.UUID, tax_return_id: uuid.UUID,
) -> DocumentChecklist:
    """Build a personalized document checklist for a tax return.

    Returns a list of expected documents derived from the user's properties,
    tax form instances, and transactions, with received/missing status.
    """
    async with AsyncSessionLocal() as db:
        tax_return = await tax_return_repo.get_by_id(db, tax_return_id, organization_id)
        if not tax_return:
            raise LookupError("Tax return not found")

        tax_year = tax_return.tax_year
        items: list[ChecklistItem] = []

        # Load shared data once to avoid redundant queries
        all_form_instances = await tax_form_repo.list_instances(db, tax_return_id)
        all_docs = await document_repo.list_filtered(db, organization_id)
        docs_by_property: dict[uuid.UUID, list] = {}
        for d in all_docs:
            if d.property_id:
                docs_by_property.setdefault(d.property_id, []).append(d)

        # 1. Property-based items: insurance, property tax statement, 1098
        items.extend(await _property_items(
            db, organization_id, tax_year, all_form_instances, docs_by_property,
        ))

        # 2. W-2 items from extracted W-2 instances
        items.extend(_w2_items(all_form_instances))

        # 3. 1099 items from extracted 1099 instances
        items.extend(_1099_items(all_form_instances))

        received_count = sum(1 for item in items if item.status == "received")
        return DocumentChecklist(
            tax_year=tax_year,
            items=items,
            received_count=received_count,
            total_count=len(items),
        )


async def _property_items(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    all_form_instances: list,
    docs_by_property: dict[uuid.UUID, list],
) -> list[ChecklistItem]:
    """Build checklist items for each active property: insurance, property tax, 1098."""
    properties = await property_repo.list_active(db, organization_id)
    if not properties:
        return []

    prop_tax_prop_ids = set(await transaction_repo.distinct_property_ids_by_category(
        db, organization_id, tax_year, "taxes",
    ))
    mortgage_prop_ids = set(await transaction_repo.distinct_property_ids_by_category(
        db, organization_id, tax_year, "mortgage_interest",
    ))

    items: list[ChecklistItem] = []

    for prop in properties:
        prop_name = prop.address or prop.name
        prop_docs = docs_by_property.get(prop.id, [])

        # --- Insurance policy ---
        insurance_matches = [
            d for d in prop_docs if d.document_type in _INSURANCE_DOC_TYPES
        ]
        items.append(ChecklistItem(
            category="property_insurance",
            description=f"Insurance policy for {prop_name}",
            property_name=prop_name,
            expected_vendor=None,
            status="received" if insurance_matches else "missing",
            document_ids=[d.id for d in insurance_matches],
        ))

        # --- Property tax statement ---
        if prop.id in prop_tax_prop_ids:
            prop_tax_docs = [
                d for d in prop_docs
                if d.document_type in _PROPERTY_TAX_DOC_TYPES
                and d.file_name
                and any(kw in d.file_name.lower() for kw in ("tax", "appraisal", "county", "property tax"))
            ]
            items.append(ChecklistItem(
                category="property_tax",
                description=f"Property tax statement for {prop_name}",
                property_name=prop_name,
                expected_vendor=None,
                status="received" if prop_tax_docs else "missing",
                document_ids=[d.id for d in prop_tax_docs],
            ))

        # --- 1098 Mortgage interest ---
        if prop.id in mortgage_prop_ids:
            mortgage_instances = [
                inst for inst in all_form_instances
                if inst.form_name == "1098"
                and inst.property_id == prop.id
                and inst.document_id is not None
            ]
            items.append(ChecklistItem(
                category="mortgage_1098",
                description=f"Form 1098 (mortgage interest) for {prop_name}",
                property_name=prop_name,
                expected_vendor=None,
                status="received" if mortgage_instances else "missing",
                document_ids=[inst.document_id for inst in mortgage_instances if inst.document_id],
            ))

    return items


def _w2_items(
    form_instances: list,
) -> list[ChecklistItem]:
    """Build checklist items for W-2 forms derived from extracted tax form instances."""
    w2_instances = [
        inst for inst in form_instances
        if inst.form_name == "w2"
        and inst.source_type == "extracted"
    ]

    items: list[ChecklistItem] = []
    seen_issuers: set[str | None] = set()

    for inst in w2_instances:
        issuer_key = inst.issuer_name
        if issuer_key in seen_issuers:
            continue
        seen_issuers.add(issuer_key)

        employer_label = inst.issuer_name or "Unknown employer"
        doc_ids = [inst.document_id] if inst.document_id else []

        items.append(ChecklistItem(
            category="w2",
            description=f"W-2 from {employer_label}",
            property_name=None,
            expected_vendor=inst.issuer_name,
            status="received" if doc_ids else "missing",
            document_ids=doc_ids,
        ))

    return items


def _1099_items(
    form_instances: list,
) -> list[ChecklistItem]:
    """Build checklist items for 1099 forms derived from extracted tax form instances."""
    form_type_labels: dict[str, str] = {
        "1099_int": "1099-INT",
        "1099_div": "1099-DIV",
        "1099_b": "1099-B",
        "1099_k": "1099-K",
        "1099_misc": "1099-MISC",
        "1099_nec": "1099-NEC",
        "1099_r": "1099-R",
        "k1": "K-1",
    }

    items: list[ChecklistItem] = []
    seen: set[tuple[str, str | None]] = set()

    for inst in form_instances:
        if inst.form_name not in form_type_labels:
            continue
        if inst.source_type != "extracted":
            continue

        key = (inst.form_name, inst.issuer_name)
        if key in seen:
            continue
        seen.add(key)

        form_label = form_type_labels[inst.form_name]
        issuer_label = inst.issuer_name or "Unknown issuer"
        doc_ids = [inst.document_id] if inst.document_id else []

        items.append(ChecklistItem(
            category=inst.form_name,
            description=f"Form {form_label} from {issuer_label}",
            property_name=None,
            expected_vendor=inst.issuer_name,
            status="received" if doc_ids else "missing",
            document_ids=doc_ids,
        ))

    return items
