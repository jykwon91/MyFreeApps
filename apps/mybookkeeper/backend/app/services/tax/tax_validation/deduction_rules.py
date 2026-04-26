"""Deduction validation rules."""
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import (
    DE_MINIMIS_SAFE_HARBOR,
    QBI_DEDUCTION_RATE,
    QBI_PHASEOUT_START,
    SALT_CAP,
    STANDARD_DEDUCTION,
)
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import transaction_repo

from ._types import FormFieldIndex, ValidationResult, sum_field


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(_validate_salt_cap(form_fields))
    results.extend(_validate_1098_unclaimed(form_fields, all_instances))
    results.extend(_validate_standard_vs_itemized(
        tax_return.tax_year, tax_return.filing_status, form_fields,
    ))
    results.extend(_validate_qbi_opportunity(
        tax_return.tax_year, tax_return.filing_status, form_fields,
    ))
    results.extend(await _validate_de_minimis_safe_harbor(db, tax_return))
    results.extend(_validate_foreign_tax_credit(form_fields))
    results.extend(_validate_early_withdrawal_penalty(form_fields))
    results.extend(_validate_mortgage_insurance_premium(form_fields))
    results.extend(_validate_property_tax_salt_allocation(form_fields, all_instances))
    return results


def _validate_salt_cap(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 5: If Schedule A Line 5d > $10,000, SALT cap error."""
    salt_total = sum_field(form_fields, "schedule_a", "line_5d")
    if salt_total > SALT_CAP:
        return [ValidationResult(
            severity="error",
            form_name="schedule_a",
            field_id="line_5d",
            message=(
                f"State and local tax deduction of {salt_total} exceeds the "
                f"$10,000 SALT cap. Deduction is limited to $10,000."
            ),
            expected_value=SALT_CAP,
            actual_value=salt_total,
        )]
    return []


def _validate_1098_unclaimed(
    form_fields: FormFieldIndex,
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 15: 1098 mortgage interest uploaded but not claimed on Schedule E or A."""
    results: list[ValidationResult] = []

    for inst in instances:
        if inst.form_name != "1098":
            continue
        box_1 = Decimal("0")
        for f in inst.fields:
            if f.field_id == "box_1" and f.value_numeric is not None:
                box_1 = f.value_numeric

        if box_1 <= Decimal("0"):
            continue

        se_line_12 = sum_field(form_fields, "schedule_e", "line_12")
        sa_line_8a = sum_field(form_fields, "schedule_a", "line_8a")

        if se_line_12 >= box_1 or sa_line_8a >= box_1:
            continue

        label = inst.issuer_name or inst.instance_label or "Unknown lender"
        results.append(ValidationResult(
            severity="warning",
            form_name="1098",
            field_id="box_1",
            message=(
                f"1098 from {label} shows ${box_1:,.2f} in mortgage interest, "
                f"but this amount does not appear on Schedule E Line 12 "
                f"(${se_line_12:,.2f}) or Schedule A Line 8a (${sa_line_8a:,.2f}). "
                f"This deduction may be unclaimed."
            ),
            expected_value=box_1,
            actual_value=se_line_12 + sa_line_8a,
        ))

    return results


def _validate_standard_vs_itemized(
    tax_year: int, filing_status: str, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 19: Compare standard deduction vs itemized to find the better option."""
    year_deductions = STANDARD_DEDUCTION.get(tax_year)
    if not year_deductions:
        return []

    standard = year_deductions.get(filing_status)
    if standard is None:
        return []

    schedule_a_total = Decimal("0")
    for field_id, entries in form_fields.get("schedule_a", {}).items():
        for f, _ in entries:
            if f.value_numeric is not None:
                schedule_a_total += f.value_numeric

    if schedule_a_total <= Decimal("0"):
        return []

    if schedule_a_total < standard:
        diff = standard - schedule_a_total
        savings = (diff * Decimal("0.24")).quantize(Decimal("0.01"))
        return [ValidationResult(
            severity="warning",
            form_name="schedule_a",
            field_id=None,
            message=(
                f"Your itemized deductions total ${schedule_a_total:,.2f}, but "
                f"the standard deduction for {filing_status} is ${standard:,.0f}. "
                f"Switching to the standard deduction could save you approximately "
                f"${savings:,.2f}."
            ),
            expected_value=standard,
            actual_value=schedule_a_total,
        )]

    return []


def _validate_qbi_opportunity(
    tax_year: int, filing_status: str, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 26: QBI deduction opportunity (Section 199A) — 20% on qualified income."""
    rental_income = max(sum_field(form_fields, "schedule_e", "line_26"), Decimal("0"))
    se_income = max(sum_field(form_fields, "schedule_c", "line_29_net_profit"), Decimal("0"))
    qbi = rental_income + se_income

    if qbi <= Decimal("0"):
        return []

    phaseout_start = QBI_PHASEOUT_START.get(tax_year, {}).get(filing_status)
    if phaseout_start is None:
        return []

    w2_wages = sum_field(form_fields, "w2", "box_1")
    investment = (
        sum_field(form_fields, "1099_int", "box_1")
        + sum_field(form_fields, "1099_div", "box_1a")
    )
    estimated_agi = w2_wages + se_income + rental_income + investment

    if estimated_agi >= phaseout_start:
        return [ValidationResult(
            severity="info",
            form_name="1040",
            field_id=None,
            message=(
                f"Your estimated AGI (${estimated_agi:,.0f}) is at or above the "
                f"QBI phase-out threshold (${phaseout_start:,.0f}). The Section 199A "
                f"deduction may be limited or unavailable."
            ),
            expected_value=phaseout_start,
            actual_value=estimated_agi,
        )]

    deduction = (qbi * QBI_DEDUCTION_RATE).quantize(Decimal("0.01"))
    tax_savings = (deduction * Decimal("0.24")).quantize(Decimal("0.01"))

    return [ValidationResult(
        severity="info",
        form_name="1040",
        field_id=None,
        message=(
            f"You may qualify for a ${deduction:,.2f} QBI deduction (20% of "
            f"${qbi:,.2f} in qualified business/rental income under Section 199A), "
            f"saving approximately ${tax_savings:,.2f}. Ensure this is claimed "
            f"on your return. Note: rental activities may need to meet safe harbor "
            f"requirements (250+ hours of rental services)."
        ),
        expected_value=None,
        actual_value=deduction,
    )]


async def _validate_de_minimis_safe_harbor(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[ValidationResult]:
    """Rule 33: De minimis safe harbor — capital improvements under $2,500."""
    cap_improvement_total = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "capital_improvement",
    )

    if cap_improvement_total <= Decimal("0"):
        return []

    cap_improvement_count = await transaction_repo.count_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "capital_improvement",
    )

    return [ValidationResult(
        severity="info",
        form_name="schedule_e",
        field_id=None,
        message=(
            f"You have {cap_improvement_count} capital improvement transaction(s) "
            f"totaling ${cap_improvement_total:,.2f}. Items under "
            f"${DE_MINIMIS_SAFE_HARBOR:,.0f} each may qualify for the de minimis "
            f"safe harbor election, allowing immediate expensing instead of "
            f"capitalization and depreciation."
        ),
        expected_value=None,
        actual_value=cap_improvement_total,
    )]


def _validate_foreign_tax_credit(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 34: Foreign tax credit opportunity from 1099-DIV/INT."""
    div_foreign_tax = sum_field(form_fields, "1099_div", "box_7")
    int_foreign_tax = sum_field(form_fields, "1099_int", "box_6")
    total_foreign = div_foreign_tax + int_foreign_tax

    if total_foreign <= Decimal("0"):
        return []

    return [ValidationResult(
        severity="info",
        form_name="1040",
        field_id=None,
        message=(
            f"You paid ${total_foreign:,.2f} in foreign taxes "
            f"(1099-DIV Box 7: ${div_foreign_tax:,.2f}, 1099-INT Box 6: "
            f"${int_foreign_tax:,.2f}). You can claim this as a tax credit "
            f"on Form 1116 or as an itemized deduction on Schedule A. The "
            f"credit is usually more beneficial."
        ),
        expected_value=None,
        actual_value=total_foreign,
    )]


def _validate_early_withdrawal_penalty(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 35: Early withdrawal penalty deduction from 1099-INT."""
    penalty = sum_field(form_fields, "1099_int", "box_2")
    if penalty <= Decimal("0"):
        return []

    sched_1_line_18 = sum_field(form_fields, "schedule_1", "line_18")
    if sched_1_line_18 >= penalty:
        return []

    return [ValidationResult(
        severity="warning",
        form_name="schedule_1",
        field_id="line_18",
        message=(
            f"1099-INT shows a ${penalty:,.2f} early withdrawal penalty. This is "
            f"deductible on Schedule 1, Line 18 as an above-the-line deduction "
            f"(reduces AGI). Currently showing ${sched_1_line_18:,.2f} on that line."
        ),
        expected_value=penalty,
        actual_value=sched_1_line_18,
    )]


def _validate_mortgage_insurance_premium(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 36: Mortgage insurance premium deduction from 1098."""
    box_5 = sum_field(form_fields, "1098", "box_5")
    if box_5 <= Decimal("0"):
        return []

    se_claimed = sum_field(form_fields, "schedule_e", "line_9")
    sa_claimed = sum_field(form_fields, "schedule_a", "line_8d")

    if se_claimed >= box_5 or sa_claimed >= box_5:
        return []

    return [ValidationResult(
        severity="warning",
        form_name="1098",
        field_id="box_5",
        message=(
            f"1098 shows ${box_5:,.2f} in mortgage insurance premiums (PMI/MIP). "
            f"This may be deductible on Schedule E (rental) or Schedule A "
            f"(personal residence). Ensure it is claimed."
        ),
        expected_value=box_5,
        actual_value=se_claimed + sa_claimed,
    )]


def _validate_property_tax_salt_allocation(
    form_fields: FormFieldIndex, instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 43: Property tax SALT allocation — investment vs primary residence."""
    se_taxes = sum_field(form_fields, "schedule_e", "line_16")
    sa_taxes = sum_field(form_fields, "schedule_a", "line_5b")

    if se_taxes <= Decimal("0") and sa_taxes <= Decimal("0"):
        return []

    rental_count = sum(
        1 for inst in instances
        if inst.form_name == "schedule_e" and inst.property_id
    )

    if rental_count > 0 and se_taxes > Decimal("0") and sa_taxes > Decimal("0"):
        return [ValidationResult(
            severity="info",
            form_name="schedule_a",
            field_id="line_5b",
            message=(
                f"You have property taxes on both Schedule E (${se_taxes:,.2f} for "
                f"rental properties) and Schedule A (${sa_taxes:,.2f} for personal "
                f"residence). Rental property taxes on Schedule E are not subject "
                f"to the $10,000 SALT cap. Verify taxes are allocated to the "
                f"correct schedule."
            ),
            expected_value=None,
            actual_value=sa_taxes,
        )]

    return []
