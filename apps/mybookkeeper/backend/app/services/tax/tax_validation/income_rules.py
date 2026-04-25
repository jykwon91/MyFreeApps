"""Income matching and withholding validation rules."""
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import (
    ADDITIONAL_MEDICARE_RATE,
    ADDITIONAL_MEDICARE_THRESHOLD,
    SE_TAX_WAGE_BASE,
    SS_TAX_RATE_EMPLOYEE,
    STANDARD_DEDUCTION,
)
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import transaction_repo

from ._types import FormFieldIndex, ValidationResult, estimate_tax_liability, sum_field


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(_validate_w2_wages(form_fields))
    results.extend(await _validate_1099k_cross(db, tax_return, form_fields))
    results.extend(_validate_ss_overcapping(tax_return.tax_year, form_fields))
    results.extend(_validate_w2_withholding(
        tax_return.tax_year, tax_return.filing_status, form_fields,
    ))
    results.extend(_validate_additional_medicare(
        tax_return.filing_status, form_fields,
    ))
    results.extend(_validate_state_withholding_summary(form_fields))
    return results


def _validate_w2_wages(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 1: Sum of W-2 box_1 values should equal 1040 Line 1a."""
    w2_sum = sum_field(form_fields, "w2", "box_1")
    line_1a = sum_field(form_fields, "1040", "line_1a")

    if w2_sum == Decimal("0") and line_1a == Decimal("0"):
        return []

    if w2_sum != line_1a:
        return [ValidationResult(
            severity="error",
            form_name="1040",
            field_id="line_1a",
            message=f"W-2 wages total ({w2_sum}) does not match 1040 Line 1a ({line_1a})",
            expected_value=w2_sum,
            actual_value=line_1a,
        )]
    return [ValidationResult(
        severity="info",
        form_name="1040",
        field_id="line_1a",
        message="W-2 wages match 1040 Line 1a",
        expected_value=w2_sum,
        actual_value=line_1a,
    )]


async def _validate_1099k_cross(
    db: AsyncSession, tax_return: TaxReturn, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 2: 1099-K gross minus channel fees should approximate Schedule E Line 3."""
    k_box_1a = sum_field(form_fields, "1099_k", "box_1a")
    if k_box_1a == Decimal("0"):
        return []

    channel_fees = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "channel_fee",
    )

    expected_income = k_box_1a - channel_fees
    se_line_3 = sum_field(form_fields, "schedule_e", "line_3")

    if se_line_3 > Decimal("0") and abs(expected_income - se_line_3) > Decimal("100"):
        return [ValidationResult(
            severity="warning",
            form_name="schedule_e",
            field_id="line_3",
            message=(
                f"1099-K gross ({k_box_1a}) minus channel fees ({channel_fees}) = "
                f"{expected_income}, but Schedule E Line 3 = {se_line_3}"
            ),
            expected_value=expected_income,
            actual_value=se_line_3,
        )]
    return []


def _validate_ss_overcapping(
    tax_year: int, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 13: Multiple W-2s with combined SS wages exceeding the wage base."""
    w2_entries = form_fields.get("w2", {}).get("box_3", [])
    if len(w2_entries) < 2:
        return []

    wage_base = SE_TAX_WAGE_BASE.get(tax_year)
    if wage_base is None:
        return []

    total_ss_wages = sum(
        (f.value_numeric for f, _ in w2_entries if f.value_numeric is not None),
        Decimal("0"),
    )

    if total_ss_wages <= wage_base:
        return []

    excess_wages = total_ss_wages - wage_base
    excess_tax = (excess_wages * SS_TAX_RATE_EMPLOYEE).quantize(Decimal("0.01"))

    return [ValidationResult(
        severity="warning",
        form_name="1040",
        field_id="line_25d",
        message=(
            f"Your combined Social Security wages from {len(w2_entries)} W-2s "
            f"total ${total_ss_wages:,.2f}, exceeding the ${wage_base:,.0f} annual "
            f"limit. You overpaid approximately ${excess_tax:,.2f} in Social Security "
            f"tax, which you can claim as a credit on Form 1040 Line 25d."
        ),
        expected_value=wage_base,
        actual_value=total_ss_wages,
    )]


def _validate_w2_withholding(
    tax_year: int, filing_status: str, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 20: Estimate if W-2 withholding is significantly over or under."""
    w2_wages = sum_field(form_fields, "w2", "box_1")
    w2_withheld = sum_field(form_fields, "w2", "box_2")
    if w2_wages <= Decimal("0") or w2_withheld <= Decimal("0"):
        return []

    std_ded = STANDARD_DEDUCTION.get(tax_year, {}).get(filing_status)
    if std_ded is None:
        return []

    taxable = max(w2_wages - std_ded, Decimal("0"))
    estimated_tax = estimate_tax_liability(tax_year, filing_status, taxable)
    if estimated_tax <= Decimal("0"):
        return []

    diff = w2_withheld - estimated_tax

    if diff > Decimal("2000"):
        return [ValidationResult(
            severity="info",
            form_name="w2",
            field_id="box_2",
            message=(
                f"Your W-2 withholding (${w2_withheld:,.2f}) exceeds the estimated "
                f"tax liability (${estimated_tax:,.2f}) by ${diff:,.2f}. You may be "
                f"overwithholding — consider adjusting your W-4 to increase your "
                f"take-home pay."
            ),
            expected_value=estimated_tax,
            actual_value=w2_withheld,
        )]

    if diff < Decimal("-1000"):
        return [ValidationResult(
            severity="warning",
            form_name="w2",
            field_id="box_2",
            message=(
                f"Your W-2 withholding (${w2_withheld:,.2f}) is ${abs(diff):,.2f} "
                f"less than the estimated tax liability (${estimated_tax:,.2f}). "
                f"You may owe taxes and could face an underpayment penalty. "
                f"Consider adjusting your W-4."
            ),
            expected_value=estimated_tax,
            actual_value=w2_withheld,
        )]

    return []


def _validate_additional_medicare(
    filing_status: str, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 25: Additional Medicare Tax (0.9%) on high earnings."""
    threshold = ADDITIONAL_MEDICARE_THRESHOLD.get(filing_status)
    if threshold is None:
        return []

    w2_medicare_wages = sum_field(form_fields, "w2", "box_5")
    se_earnings = sum_field(form_fields, "schedule_se", "net_earnings")
    total_earnings = w2_medicare_wages + se_earnings

    if total_earnings <= threshold:
        return []

    excess = total_earnings - threshold
    additional_tax = (excess * ADDITIONAL_MEDICARE_RATE).quantize(Decimal("0.01"))

    return [ValidationResult(
        severity="warning",
        form_name="1040",
        field_id=None,
        message=(
            f"Your combined Medicare wages and SE earnings (${total_earnings:,.2f}) "
            f"exceed the ${threshold:,.0f} threshold. You may owe ${additional_tax:,.2f} "
            f"in Additional Medicare Tax (0.9%) on the excess. Report on Form 8959."
        ),
        expected_value=threshold,
        actual_value=total_earnings,
    )]


def _validate_state_withholding_summary(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 41: State tax withholding summary across all sources."""
    w2_state = sum_field(form_fields, "w2", "box_17")
    nec_state = sum_field(form_fields, "1099_nec", "box_5")
    misc_state = sum_field(form_fields, "1099_misc", "box_16")
    total_state = w2_state + nec_state + misc_state

    if total_state <= Decimal("0"):
        return []

    sources: list[str] = []
    if w2_state > 0:
        sources.append(f"W-2: ${w2_state:,.2f}")
    if nec_state > 0:
        sources.append(f"1099-NEC: ${nec_state:,.2f}")
    if misc_state > 0:
        sources.append(f"1099-MISC: ${misc_state:,.2f}")

    return [ValidationResult(
        severity="info",
        form_name="1040",
        field_id=None,
        message=(
            f"Total state tax withheld: ${total_state:,.2f} "
            f"({', '.join(sources)}). Ensure this is claimed on your state "
            f"return. If itemizing federally, this contributes to SALT "
            f"(subject to $10,000 cap)."
        ),
        expected_value=None,
        actual_value=total_state,
    )]
