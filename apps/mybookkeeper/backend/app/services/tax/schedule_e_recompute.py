"""Derives Schedule E form values from approved, tax-relevant transactions."""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import SCHEDULE_E_AGGREGATE_LABEL, SCHEDULE_E_LINE_LABELS
from app.models.tax.property_depreciation import PropertyDepreciation
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_return import TaxReturn
from app.repositories import property_repo, tax_return_repo, transaction_repo

SCHEDULE_E_LINE_TO_DB: dict[str, str] = {
    "line_3_rents_received": "line_3",
    "line_5_advertising": "line_5",
    "line_6_auto_travel": "line_6",
    "line_7_cleaning_maintenance": "line_7",
    "line_8_commissions": "line_8",
    "line_9_insurance": "line_9",
    "line_10_legal_professional": "line_10",
    "line_12_mortgage_interest": "line_12",
    "line_13_other_interest": "line_13",
    "line_14_repairs": "line_14",
    "line_16_taxes": "line_16",
    "line_17_utilities": "line_17",
    "line_18_depreciation": "line_18",
    "line_19_other": "line_19",
}

DEPRECIATION_LINE = "line_18"
FORM_4562_SOURCE_DESCRIPTION = "Form 4562 depreciation"

EXPENSE_LINES = [
    "line_5", "line_6", "line_7", "line_8", "line_9", "line_10",
    "line_12", "line_13", "line_14", "line_16", "line_17", "line_18", "line_19",
]


async def compute_schedule_e(
    db: AsyncSession,
    tax_return: TaxReturn,
    depreciation: dict[uuid.UUID, PropertyDepreciation],
) -> int:
    """Compute Schedule E per property from approved, tax-relevant transactions.

    Each property's Form 4562 depreciation (``depreciation``, by property) is its line 18,
    in place of any transactions tagged as depreciation. Only includes properties
    classified as INVESTMENT. Unclassified, primary residence, and second home
    properties are excluded from Schedule E.
    Totals are built from what each line ends up saying, so an overridden line
    carries through to lines 20, 21 and 26.
    """
    org_id = tax_return.organization_id
    tax_year = tax_return.tax_year

    rows = await transaction_repo.sum_schedule_e_by_property_line(db, org_id, tax_year)

    property_data: dict[uuid.UUID, dict[str, Decimal]] = {}
    for row in rows:
        prop_id = row.property_id
        se_line = SCHEDULE_E_LINE_TO_DB.get(row.schedule_e_line, row.schedule_e_line)
        if prop_id not in property_data:
            property_data[prop_id] = {}
        property_data[prop_id][se_line] = row.total

    # A claimed Form 4562 is the property's depreciation; transactions tagged as
    # depreciation only stand in for it when there is no Form 4562.
    for prop_id, claimed in depreciation.items():
        property_data.setdefault(prop_id, {})[DEPRECIATION_LINE] = claimed.amount

    # A property or line with nothing left still has to be written back as zero,
    # or the return keeps the figure from the last recompute.
    instances = await tax_return_repo.get_form_instances(db, tax_return.id, "schedule_e")
    saved_lines = {
        i.property_id: {f.field_id for f in i.fields}
        for i in instances
        if i.source_type == "computed" and i.property_id is not None
    }

    # Only investment properties are on Schedule E. One that no longer is keeps its
    # saved form (zeroed, bar any override) but stays out of line 26.
    prop_ids = list(property_data.keys() | saved_lines.keys())
    classifications = await property_repo.get_classifications_by_ids(db, org_id, prop_ids) if prop_ids else {}
    rentals = {pid for pid in prop_ids if classifications.get(pid) == "INVESTMENT"}
    property_data = {pid: lines for pid, lines in property_data.items() if pid in rentals}
    for pid in saved_lines:
        property_data.setdefault(pid, {})

    # Fetch transaction IDs for audit trail
    txn_rows = await transaction_repo.list_schedule_e_transaction_details(db, org_id, tax_year)
    txn_by_prop_line: dict[tuple[uuid.UUID, str], list[tuple[uuid.UUID, Decimal]]] = {}
    for txn in txn_rows:
        se_line = SCHEDULE_E_LINE_TO_DB.get(txn.schedule_e_line, txn.schedule_e_line)
        key = (txn.property_id, se_line)
        if key not in txn_by_prop_line:
            txn_by_prop_line[key] = []
        txn_by_prop_line[key].append((txn.id, txn.amount))

    prop_labels = await property_repo.get_labels_by_ids(db, org_id, list(property_data))

    forms_updated = 0
    total_net = Decimal("0")
    for prop_id, line_totals in property_data.items():
        label = prop_labels.get(prop_id, str(prop_id))
        instance = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_e", "computed",
            property_id=prop_id, instance_label=label,
        )
        forms_updated += 1

        stated: dict[str, Decimal] = {}
        for line_id in list(SCHEDULE_E_LINE_LABELS.keys()):
            if line_id in ("line_20", "line_21", "line_26"):
                continue
            amount = line_totals.get(line_id, Decimal("0"))
            if (
                amount == Decimal("0")
                and line_id != "line_3"
                and line_id not in saved_lines.get(prop_id, set())
            ):
                continue
            field = await tax_return_repo.upsert_field(
                db, instance.id, line_id,
                SCHEDULE_E_LINE_LABELS[line_id],
                value_numeric=amount, is_calculated=True,
            )
            stated[line_id] = field.value_numeric or Decimal("0")
            claimed = depreciation.get(prop_id) if prop_id in rentals else None
            if line_id == DEPRECIATION_LINE and claimed is not None:
                sources = [TaxFormFieldSource(
                    field_id=field.id,
                    source_type="tax_form_instance",
                    source_id=claimed.form_instance_id,
                    amount=claimed.amount,
                    description=FORM_4562_SOURCE_DESCRIPTION,
                )]
            else:
                sources = [
                    TaxFormFieldSource(
                        field_id=field.id,
                        source_type="transaction",
                        source_id=txn_id,
                        amount=txn_amount,
                    )
                    for txn_id, txn_amount in txn_by_prop_line.get((prop_id, line_id), [])
                ]
            await tax_return_repo.replace_field_sources(db, field.id, sources)

        line_20 = await tax_return_repo.upsert_field(
            db, instance.id, "line_20",
            SCHEDULE_E_LINE_LABELS["line_20"],
            value_numeric=sum((stated.get(line, Decimal("0")) for line in EXPENSE_LINES), Decimal("0")),
            is_calculated=True,
        )

        income = stated.get("line_3", Decimal("0"))
        line_21 = await tax_return_repo.upsert_field(
            db, instance.id, "line_21",
            SCHEDULE_E_LINE_LABELS["line_21"],
            value_numeric=income - (line_20.value_numeric or Decimal("0")),
            is_calculated=True,
        )
        if prop_id in rentals:
            total_net += line_21.value_numeric or Decimal("0")

    # Line 26 (sum of all property Line 21s) as a single-instance aggregate
    if property_data:
        aggregate = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_e", "computed",
            instance_label=SCHEDULE_E_AGGREGATE_LABEL,
        )
        await tax_return_repo.upsert_field(
            db, aggregate.id, "line_26",
            SCHEDULE_E_LINE_LABELS["line_26"],
            value_numeric=total_net, is_calculated=True,
        )

    return forms_updated
