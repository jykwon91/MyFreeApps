"""Recompute service — derives computed tax form values from source data.

Idempotent: running twice produces the same result (upserts fields, never duplicates).
"""
import logging
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_return import TaxReturn
from app.core.tags import CATEGORY_TO_SCHEDULE_C
from app.core.tax_constants import (
    SCHEDULE_C_LINE_LABELS,
    SCHEDULE_E_LINE_LABELS,
    SCHEDULE_SE_LABELS,
)
from app.repositories import (
    activity_repo,
    property_repo,
    tax_return_repo,
    transaction_repo,
)
from app.services.tax import tax_validation_service

logger = logging.getLogger(__name__)

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

SCHEDULE_C_LINE_TO_DB: dict[str, str] = {
    "line_1_gross_receipts":       "line_1",
    "line_8_advertising":          "line_8",
    "line_9_car_truck":            "line_9",
    "line_10_commissions":         "line_10",
    "line_11_contract_labor":      "line_11",
    "line_15_insurance":           "line_15",
    "line_17_legal_professional":  "line_17",
    "line_21_repairs_maintenance": "line_21",
    "line_22_supplies":            "line_22",
    "line_23_taxes_licenses":      "line_23",
    "line_24a_travel":             "line_24a",
    "line_24b_meals":              "line_24b",
    "line_25_utilities":           "line_25",
    "line_27a_other":              "line_27a",
    "line_30_business_use_home":   "line_30",
}

SCHEDULE_C_EXPENSE_LINES = [
    "line_8", "line_9", "line_10", "line_11", "line_15", "line_17",
    "line_21", "line_22", "line_23", "line_24a", "line_24b", "line_25",
    "line_27a", "line_30",
]

SE_TAX_WAGE_BASE_2024 = Decimal("168600")
SE_TAX_RATE_FULL = Decimal("0.153")
SE_TAX_RATE_MEDICARE = Decimal("0.029")
SE_STATUTORY_FACTOR = Decimal("0.9235")


async def recompute(
    organization_id: uuid.UUID, tax_return_id: uuid.UUID
) -> int:
    """Recompute all derived form values for a tax return.

    Returns the number of form instances updated.
    """
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(db, tax_return_id, organization_id)
        if not tax_return:
            raise LookupError("Tax return not found")

        forms_updated = 0
        forms_updated += await _compute_schedule_e(db, tax_return)
        forms_updated += await _compute_schedule_c(db, tax_return)
        forms_updated += await _compute_schedule_se(db, tax_return)
        forms_updated += await _compute_form_4562(db, tax_return)
        forms_updated += await _compute_1040_aggregation(db, tax_return)

        tax_return.needs_recompute = False

    await tax_validation_service.validate(organization_id, tax_return_id)

    return forms_updated


async def _compute_schedule_e(db: AsyncSession, tax_return: TaxReturn) -> int:
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
            if amount == Decimal("0") and line_id != "line_3":
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


async def _compute_schedule_c(db: AsyncSession, tax_return: TaxReturn) -> int:
    """Compute Schedule C per self-employment activity from approved, tax-relevant transactions."""
    org_id = tax_return.organization_id
    tax_year = tax_return.tax_year

    activities = await activity_repo.list_active_self_employment(db, org_id)
    if not activities:
        return 0

    activity_ids = [a.id for a in activities]
    txn_rows = await transaction_repo.list_by_activity_ids(db, org_id, tax_year, activity_ids)

    activity_line_totals: dict[uuid.UUID, dict[str, Decimal]] = {}
    activity_line_sources: dict[tuple[uuid.UUID, str], list[tuple[uuid.UUID, Decimal]]] = {}

    for txn in txn_rows:
        sched_c_line = CATEGORY_TO_SCHEDULE_C.get(txn.category)
        if not sched_c_line:
            continue
        db_line = SCHEDULE_C_LINE_TO_DB.get(sched_c_line, sched_c_line)

        if txn.activity_id not in activity_line_totals:
            activity_line_totals[txn.activity_id] = {}
        existing = activity_line_totals[txn.activity_id].get(db_line, Decimal("0"))
        activity_line_totals[txn.activity_id][db_line] = existing + txn.amount

        key = (txn.activity_id, db_line)
        if key not in activity_line_sources:
            activity_line_sources[key] = []
        activity_line_sources[key].append((txn.id, txn.amount))

    activity_labels: dict[uuid.UUID, str] = {a.id: a.label for a in activities}

    forms_updated = 0
    for act_id, line_totals in activity_line_totals.items():
        label = activity_labels.get(act_id, str(act_id))
        act = next((a for a in activities if a.id == act_id), None)
        prop_id = act.property_id if act else None

        instance = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_c", "computed",
            property_id=prop_id, instance_label=label,
        )
        forms_updated += 1

        for line_id, line_label in SCHEDULE_C_LINE_LABELS.items():
            if line_id in ("line_28_total_expenses", "line_29_net_profit"):
                continue
            amount = line_totals.get(line_id, Decimal("0"))
            if amount == Decimal("0") and line_id != "line_1":
                continue
            field = await tax_return_repo.upsert_field(
                db, instance.id, line_id,
                line_label,
                value_numeric=amount, is_calculated=True,
            )
            sources = [
                TaxFormFieldSource(
                    field_id=field.id,
                    source_type="transaction",
                    source_id=txn_id,
                    amount=txn_amount,
                )
                for txn_id, txn_amount in activity_line_sources.get((act_id, line_id), [])
            ]
            await tax_return_repo.replace_field_sources(db, field.id, sources)

        total_expenses = sum(
            line_totals.get(line, Decimal("0")) for line in SCHEDULE_C_EXPENSE_LINES
        )
        await tax_return_repo.upsert_field(
            db, instance.id, "line_28_total_expenses",
            SCHEDULE_C_LINE_LABELS["line_28_total_expenses"],
            value_numeric=total_expenses, is_calculated=True,
        )

        gross_receipts = line_totals.get("line_1", Decimal("0"))
        net_profit = gross_receipts - total_expenses
        await tax_return_repo.upsert_field(
            db, instance.id, "line_29_net_profit",
            SCHEDULE_C_LINE_LABELS["line_29_net_profit"],
            value_numeric=net_profit, is_calculated=True,
        )

    return forms_updated


async def _compute_schedule_se(db: AsyncSession, tax_return: TaxReturn) -> int:
    """Compute Schedule SE from Schedule C net profit."""
    all_instances = await tax_return_repo.get_form_instances(db, tax_return.id, "schedule_c")
    if not all_instances:
        return 0

    total_net_profit = Decimal("0")
    for inst in all_instances:
        for f in inst.fields:
            if f.field_id == "line_29_net_profit" and f.value_numeric is not None:
                total_net_profit += f.value_numeric

    if total_net_profit <= Decimal("0"):
        return 0

    net_earnings = (total_net_profit * SE_STATUTORY_FACTOR).quantize(Decimal("0.01"))

    if net_earnings <= SE_TAX_WAGE_BASE_2024:
        se_tax = (net_earnings * SE_TAX_RATE_FULL).quantize(Decimal("0.01"))
    else:
        se_tax_base = (SE_TAX_WAGE_BASE_2024 * SE_TAX_RATE_FULL).quantize(Decimal("0.01"))
        se_tax_excess = ((net_earnings - SE_TAX_WAGE_BASE_2024) * SE_TAX_RATE_MEDICARE).quantize(Decimal("0.01"))
        se_tax = se_tax_base + se_tax_excess

    deductible_half = (se_tax / 2).quantize(Decimal("0.01"))

    instance = await tax_return_repo.upsert_form_instance(
        db, tax_return.id, "schedule_se", "computed",
        instance_label="Schedule SE",
    )

    await tax_return_repo.upsert_field(
        db, instance.id, "net_earnings",
        SCHEDULE_SE_LABELS["net_earnings"],
        value_numeric=net_earnings, is_calculated=True,
    )
    await tax_return_repo.upsert_field(
        db, instance.id, "se_tax",
        SCHEDULE_SE_LABELS["se_tax"],
        value_numeric=se_tax, is_calculated=True,
    )
    await tax_return_repo.upsert_field(
        db, instance.id, "deductible_half",
        SCHEDULE_SE_LABELS["deductible_half"],
        value_numeric=deductible_half, is_calculated=True,
    )

    return 1


async def _compute_form_4562(db: AsyncSession, tax_return: TaxReturn) -> int:
    """Compute Form 4562 depreciation from property data."""
    properties = await property_repo.list_depreciable(db, tax_return.organization_id)

    forms_updated = 0
    for prop in properties:
        useful_life = Decimal("27.5")
        if prop.property_class == "commercial_39":
            useful_life = Decimal("39")

        land = prop.land_value or Decimal("0")
        depreciable_basis = prop.purchase_price - land
        if depreciable_basis <= 0:
            continue

        annual_rate = depreciable_basis / useful_life
        start_year = prop.date_placed_in_service.year
        start_month = prop.date_placed_in_service.month

        if tax_return.tax_year < start_year:
            continue

        total_months = int(useful_life * 12)
        end_year = start_year + (total_months + start_month - 2) // 12

        if tax_return.tax_year > end_year:
            continue

        if tax_return.tax_year == start_year:
            months_in_service = Decimal(12 - start_month) + Decimal("0.5")
            annual_depreciation = (annual_rate * months_in_service / 12).quantize(Decimal("0.01"))
        elif tax_return.tax_year == end_year:
            prior_total = Decimal("0")
            for y in range(start_year, end_year):
                if y == start_year:
                    m = Decimal(12 - start_month) + Decimal("0.5")
                    prior_total += (annual_rate * m / 12).quantize(Decimal("0.01"))
                else:
                    prior_total += annual_rate.quantize(Decimal("0.01"))
            annual_depreciation = (depreciable_basis - prior_total).quantize(Decimal("0.01"))
            if annual_depreciation < 0:
                annual_depreciation = Decimal("0")
        else:
            annual_depreciation = annual_rate.quantize(Decimal("0.01"))

        label = prop.address or prop.name
        instance = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "form_4562", "computed",
            property_id=prop.id, instance_label=label,
        )
        forms_updated += 1

        await tax_return_repo.upsert_field(
            db, instance.id, "depreciation_amount",
            "Annual depreciation",
            value_numeric=annual_depreciation, is_calculated=True,
        )
        await tax_return_repo.upsert_field(
            db, instance.id, "depreciable_basis",
            "Depreciable basis (cost minus land)",
            value_numeric=depreciable_basis, is_calculated=True,
        )
        await tax_return_repo.upsert_field(
            db, instance.id, "useful_life_years",
            "Recovery period (years)",
            value_numeric=useful_life, is_calculated=True,
        )

    return forms_updated


async def _compute_1040_aggregation(db: AsyncSession, tax_return: TaxReturn) -> int:
    """Aggregate source form fields into 1040 and intermediate schedule fields."""
    all_instances = await tax_return_repo.get_all_form_instances(db, tax_return.id)

    field_map: dict[str, dict[str, Decimal]] = {}
    for inst in all_instances:
        if inst.form_name not in field_map:
            field_map[inst.form_name] = {}
        for f in inst.fields:
            if f.value_numeric is not None:
                key = f.field_id
                existing = field_map[inst.form_name].get(key, Decimal("0"))
                field_map[inst.form_name][key] = existing + f.value_numeric

    forms_updated = 0

    # W-2 wages sum -> 1040 Line 1a
    w2_box_1 = field_map.get("w2", {}).get("box_1", Decimal("0"))
    if w2_box_1:
        inst_1040 = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "1040", "computed",
            instance_label="Form 1040",
        )
        forms_updated += 1
        await tax_return_repo.upsert_field(
            db, inst_1040.id, "line_1a",
            "Wages, salaries, tips",
            value_numeric=w2_box_1, is_calculated=True,
        )

    # W-2 Box 2 sum -> 1040 Line 25a
    w2_box_2 = field_map.get("w2", {}).get("box_2", Decimal("0"))
    if w2_box_2:
        inst_1040 = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "1040", "computed",
            instance_label="Form 1040",
        )
        await tax_return_repo.upsert_field(
            db, inst_1040.id, "line_25a",
            "Federal income tax withheld from W-2",
            value_numeric=w2_box_2, is_calculated=True,
        )

    # 1099-INT Box 1 -> Schedule B Line 4 -> 1040 Line 2b
    int_box_1 = field_map.get("1099_int", {}).get("box_1", Decimal("0"))
    if int_box_1:
        inst_sched_b = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_b", "computed",
            instance_label="Schedule B",
        )
        forms_updated += 1
        await tax_return_repo.upsert_field(
            db, inst_sched_b.id, "line_4",
            "Total interest income",
            value_numeric=int_box_1, is_calculated=True,
        )

        inst_1040 = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "1040", "computed",
            instance_label="Form 1040",
        )
        await tax_return_repo.upsert_field(
            db, inst_1040.id, "line_2b",
            "Taxable interest",
            value_numeric=int_box_1, is_calculated=True,
        )

    # 1099-DIV Box 1a -> Schedule B Line 6 -> 1040 Line 3b
    div_box_1a = field_map.get("1099_div", {}).get("box_1a", Decimal("0"))
    if div_box_1a:
        inst_sched_b = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_b", "computed",
            instance_label="Schedule B",
        )
        await tax_return_repo.upsert_field(
            db, inst_sched_b.id, "line_6",
            "Total ordinary dividends",
            value_numeric=div_box_1a, is_calculated=True,
        )

        inst_1040 = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "1040", "computed",
            instance_label="Form 1040",
        )
        await tax_return_repo.upsert_field(
            db, inst_1040.id, "line_3b",
            "Ordinary dividends",
            value_numeric=div_box_1a, is_calculated=True,
        )

    # Schedule E Line 26 -> Schedule 1 Line 5 -> 1040 Line 8
    se_line_26 = field_map.get("schedule_e", {}).get("line_26", Decimal("0"))
    if se_line_26:
        inst_sched_1 = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "schedule_1", "computed",
            instance_label="Schedule 1",
        )
        forms_updated += 1
        await tax_return_repo.upsert_field(
            db, inst_sched_1.id, "line_5",
            "Rental real estate, royalties, partnerships, S corps, trusts",
            value_numeric=se_line_26, is_calculated=True,
        )

        # Schedule 1 Line 10 = Line 5 (simplified — other lines would add here)
        sched_1_line_10 = se_line_26
        await tax_return_repo.upsert_field(
            db, inst_sched_1.id, "line_10",
            "Total income adjustments",
            value_numeric=sched_1_line_10, is_calculated=True,
        )

        inst_1040 = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "1040", "computed",
            instance_label="Form 1040",
        )
        await tax_return_repo.upsert_field(
            db, inst_1040.id, "line_8",
            "Other income from Schedule 1, line 10",
            value_numeric=sched_1_line_10, is_calculated=True,
        )

    return forms_updated
