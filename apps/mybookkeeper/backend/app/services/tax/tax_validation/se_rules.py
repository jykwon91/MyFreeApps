"""Self-employment validation rules."""
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import SE_TAX_WAGE_BASE
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn

from ._types import FormFieldIndex, ValidationResult, sum_field


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(_validate_se_wage_base(tax_return.tax_year, form_fields))
    results.extend(_validate_1099nec_without_schedule_c(form_fields))
    results.extend(_validate_se_deduction_missing(form_fields))
    results.extend(_validate_meals_deduction(form_fields))
    results.extend(_validate_home_office_not_claimed(form_fields))
    results.extend(_validate_business_mileage_not_claimed(form_fields))
    return results


def _validate_se_wage_base(
    tax_year: int, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 12: Warn if SE tax wage base is not confirmed for the tax year."""
    if tax_year in SE_TAX_WAGE_BASE:
        return []

    se_net_profit = sum_field(form_fields, "schedule_c", "line_29_net_profit")
    if se_net_profit <= Decimal("0"):
        return []

    latest_year = max(SE_TAX_WAGE_BASE)
    return [ValidationResult(
        severity="warning",
        form_name="schedule_se",
        field_id="net_earnings",
        message=(
            f"The Social Security wage base for {tax_year} has not been confirmed. "
            f"SE tax calculations are using the {latest_year} wage base "
            f"(${SE_TAX_WAGE_BASE[latest_year]:,.0f}). Verify the correct figure "
            f"with your tax software."
        ),
        expected_value=None,
        actual_value=None,
    )]


def _validate_1099nec_without_schedule_c(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 14: 1099-NEC income without a Schedule C → missing SE reporting and deductions."""
    nec_box_1 = sum_field(form_fields, "1099_nec", "box_1")
    if nec_box_1 <= Decimal("0"):
        return []

    sched_c_profit = sum_field(form_fields, "schedule_c", "line_29_net_profit")
    sched_c_gross = sum_field(form_fields, "schedule_c", "line_1")
    if sched_c_profit != Decimal("0") or sched_c_gross != Decimal("0"):
        return []

    se_tax = (nec_box_1 * Decimal("0.9235") * Decimal("0.153")).quantize(Decimal("0.01"))

    return [ValidationResult(
        severity="warning",
        form_name="schedule_c",
        field_id=None,
        message=(
            f"You received ${nec_box_1:,.2f} in 1099-NEC income but have no "
            f"Schedule C. This income requires Schedule C filing and is subject to "
            f"approximately ${se_tax:,.2f} in self-employment tax. Create a "
            f"self-employment activity to track deductible business expenses "
            f"against this income."
        ),
        expected_value=None,
        actual_value=nec_box_1,
    )]


def _validate_se_deduction_missing(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 16: SE tax deductible half should reduce AGI via Schedule 1."""
    deductible_half = sum_field(form_fields, "schedule_se", "deductible_half")
    if deductible_half <= Decimal("0"):
        return []

    sched_1_line_15 = sum_field(form_fields, "schedule_1", "line_15")

    if sched_1_line_15 >= deductible_half:
        return []

    tax_cost = (deductible_half * Decimal("0.24")).quantize(Decimal("0.01"))

    return [ValidationResult(
        severity="warning",
        form_name="schedule_1",
        field_id="line_15",
        message=(
            f"Your SE tax deduction of ${deductible_half:,.2f} should reduce "
            f"your AGI via Schedule 1 Line 15, but it shows ${sched_1_line_15:,.2f}. "
            f"This missing deduction is costing you approximately ${tax_cost:,.2f} "
            f"in taxes."
        ),
        expected_value=deductible_half,
        actual_value=sched_1_line_15,
    )]


def _validate_meals_deduction(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 37: Meals are only 50% deductible — verify correct amount."""
    meals = sum_field(form_fields, "schedule_c", "line_24b")
    if meals <= Decimal("0"):
        return []

    return [ValidationResult(
        severity="info",
        form_name="schedule_c",
        field_id="line_24b",
        message=(
            f"Schedule C shows ${meals:,.2f} in meals expenses. Business meals "
            f"are only 50% deductible. Verify this amount represents the 50% "
            f"deductible portion, not the full amount spent."
        ),
        expected_value=None,
        actual_value=meals,
    )]


def _validate_home_office_not_claimed(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 38: Home office deduction not claimed for SE filers."""
    se_income = sum_field(form_fields, "schedule_c", "line_29_net_profit")
    if se_income <= Decimal("0"):
        return []

    home_office = sum_field(form_fields, "schedule_c", "line_30")
    if home_office > Decimal("0"):
        return []

    return [ValidationResult(
        severity="info",
        form_name="schedule_c",
        field_id="line_30",
        message=(
            f"You have ${se_income:,.2f} in self-employment income but no home "
            f"office deduction (Schedule C Line 30). If you use a dedicated space "
            f"in your home exclusively for business, you may qualify for a "
            f"deduction using the simplified method ($5/sq ft, up to 300 sq ft = "
            f"$1,500 max) or the regular method."
        ),
        expected_value=None,
        actual_value=Decimal("0"),
    )]


def _validate_business_mileage_not_claimed(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 39: Business mileage not claimed for SE filers."""
    se_income = sum_field(form_fields, "schedule_c", "line_29_net_profit")
    if se_income <= Decimal("0"):
        return []

    vehicle_expense = sum_field(form_fields, "schedule_c", "line_9")
    if vehicle_expense > Decimal("0"):
        return []

    return [ValidationResult(
        severity="info",
        form_name="schedule_c",
        field_id="line_9",
        message=(
            f"You have ${se_income:,.2f} in self-employment income but no vehicle "
            f"expenses (Schedule C Line 9). If you drive for business purposes, "
            f"you can deduct mileage at the IRS standard rate or actual expenses."
        ),
        expected_value=None,
        actual_value=Decimal("0"),
    )]
