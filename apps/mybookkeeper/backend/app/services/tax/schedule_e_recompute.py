"""Derives Schedule E form values from approved, tax-relevant transactions."""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import SCHEDULE_E_LINE_LABELS
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

EXPENSE_LINES = [
    "line_5", "line_6", "line_7", "line_8", "line_9", "line_10",
    "line_12", "line_13", "line_14", "line_16", "line_17", "line_18", "line_19",
]


async def compute_schedule_e(db: AsyncSession, tax_return: TaxReturn) -> int:
    """Compute Schedule E per property from approved, tax-relevant transactions.

    Only includes properties classified as INVESTMENT. Unclassified, primary residence,
    and second home properties are excluded from Schedule E computation.
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

    # Filter to only investment properties
    if property_data:
        classifications = await property_repo.get_classifications_by_ids(
            db, list(property_data.keys()),
        )
        property_data = {
            pid: lines for pid, lines in property_data.items()
            if classifications.get(pid) == "INVESTMENT"
        }

    # A property or line with nothing left still has to be written back as zero,
    # or the return keeps the figure from the last recompute.
    instances = await tax_return_repo.get_form_instances(db, tax_return.id, "schedule_e")
    saved_lines = {
        i.property_id: {f.field_id for f in i.fields}
        for i in instances
        if i.source_type == "computed" and i.property_id is not None
    }
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

    prop_ids = list(property_data.keys())
    prop_labels = await property_repo.get_labels_by_ids(db, prop_ids)

    forms_updated = 0
    for prop_id, line_totals in property_data.items():
        label = prop_labels.get(prop_id, str(prop_id))
        instance = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_e", "computed",
            property_id=prop_id, instance_label=label,
        )
        forms_updated += 1

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

        total_expenses = sum(
            line_totals.get(line, Decimal("0")) for line in EXPENSE_LINES
        )
        await tax_return_repo.upsert_field(
            db, instance.id, "line_20",
            SCHEDULE_E_LINE_LABELS["line_20"],
            value_numeric=total_expenses, is_calculated=True,
        )

        income = line_totals.get("line_3", Decimal("0"))
        net_income = income - total_expenses
        await tax_return_repo.upsert_field(
            db, instance.id, "line_21",
            SCHEDULE_E_LINE_LABELS["line_21"],
            value_numeric=net_income, is_calculated=True,
        )

    # Compute Line 26 (sum of all property Line 21s) as a single-instance aggregate
    if property_data:
        total_net = Decimal("0")
        for prop_id, line_totals in property_data.items():
            income = line_totals.get("line_3", Decimal("0"))
            expenses = sum(
                line_totals.get(line, Decimal("0")) for line in EXPENSE_LINES
            )
            total_net += income - expenses

        aggregate = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_e", "computed",
            instance_label="Total (all properties)",
        )
        await tax_return_repo.upsert_field(
            db, aggregate.id, "line_26",
            SCHEDULE_E_LINE_LABELS["line_26"],
            value_numeric=total_net, is_calculated=True,
        )

    return forms_updated
