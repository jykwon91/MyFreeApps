"""Investment income validation rules (capital gains, NIIT, wash sales)."""
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import CAPITAL_LOSS_LIMIT, NIIT_RATE, NIIT_THRESHOLD
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import tax_carryforward_repo

from ._types import FormFieldIndex, ValidationResult, sum_field


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(_validate_capital_loss(form_fields))
    results.extend(await _validate_capital_loss_carryforward(db, tax_return, form_fields))
    results.extend(_validate_niit(tax_return.filing_status, form_fields))
    results.extend(_validate_wash_sale(form_fields))
    return results


def _validate_capital_loss(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 4: If Schedule D shows net loss > $3,000, warn about limitation."""
    sched_d_net = sum_field(form_fields, "schedule_d", "net_gain_loss")
    if sched_d_net < -CAPITAL_LOSS_LIMIT:
        return [ValidationResult(
            severity="warning",
            form_name="schedule_d",
            field_id="net_gain_loss",
            message=(
                f"Capital loss of {abs(sched_d_net)} exceeds the $3,000 annual "
                f"deduction limit. Only $3,000 can be deducted this year."
            ),
            expected_value=-CAPITAL_LOSS_LIMIT,
            actual_value=sched_d_net,
        )]
    return []


async def _validate_capital_loss_carryforward(
    db: AsyncSession, tax_return: TaxReturn, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 22: Capital loss carryforward not applied."""
    remaining = await tax_carryforward_repo.sum_remaining_for_year(
        db, tax_return.organization_id, tax_return.tax_year, "capital_loss",
    )
    if remaining <= Decimal("0"):
        return []

    sched_d_net = sum_field(form_fields, "schedule_d", "net_gain_loss")
    deductible = min(remaining, CAPITAL_LOSS_LIMIT)
    if sched_d_net > Decimal("0"):
        deductible = min(remaining, sched_d_net + CAPITAL_LOSS_LIMIT)

    tax_savings = (min(deductible, CAPITAL_LOSS_LIMIT) * Decimal("0.24")).quantize(
        Decimal("0.01"),
    )

    return [ValidationResult(
        severity="warning",
        form_name="schedule_d",
        field_id="net_gain_loss",
        message=(
            f"You have ${remaining:,.2f} in capital loss carryforward from prior "
            f"years. Up to ${CAPITAL_LOSS_LIMIT:,.0f} can be deducted against "
            f"ordinary income annually, saving approximately ${tax_savings:,.2f}. "
            f"Ensure this is reported on Schedule D."
        ),
        expected_value=None,
        actual_value=remaining,
    )]


def _validate_niit(
    filing_status: str, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 24: Net Investment Income Tax (3.8%) warning."""
    threshold = NIIT_THRESHOLD.get(filing_status)
    if threshold is None:
        return []

    interest = sum_field(form_fields, "1099_int", "box_1")
    dividends = sum_field(form_fields, "1099_div", "box_1a")
    cap_gains = max(sum_field(form_fields, "schedule_d", "net_gain_loss"), Decimal("0"))
    rental = max(sum_field(form_fields, "schedule_e", "line_26"), Decimal("0"))
    investment_income = interest + dividends + cap_gains + rental

    if investment_income <= Decimal("0"):
        return []

    w2_wages = sum_field(form_fields, "w2", "box_1")
    se_income = max(sum_field(form_fields, "schedule_c", "line_29_net_profit"), Decimal("0"))
    estimated_agi = w2_wages + se_income + investment_income

    if estimated_agi <= threshold:
        return []

    excess = estimated_agi - threshold
    niit_base = min(investment_income, excess)
    niit_tax = (niit_base * NIIT_RATE).quantize(Decimal("0.01"))

    return [ValidationResult(
        severity="warning",
        form_name="1040",
        field_id=None,
        message=(
            f"Your estimated AGI (${estimated_agi:,.0f}) exceeds the "
            f"${threshold:,.0f} NIIT threshold for {filing_status} filers. "
            f"You may owe approximately ${niit_tax:,.2f} in Net Investment "
            f"Income Tax (3.8%) on ${niit_base:,.2f} of investment income."
        ),
        expected_value=threshold,
        actual_value=estimated_agi,
    )]


def _validate_wash_sale(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 40: Wash sale detection from 1099-B."""
    wash_sale_amount = sum_field(form_fields, "1099_b", "wash_sale_loss_disallowed")
    if wash_sale_amount <= Decimal("0"):
        return []

    return [ValidationResult(
        severity="warning",
        form_name="schedule_d",
        field_id=None,
        message=(
            f"Your 1099-B reports ${wash_sale_amount:,.2f} in wash sale loss "
            f"disallowed. These losses cannot be deducted and must be added to "
            f"the cost basis of the replacement shares. Verify this is reflected "
            f"correctly on Form 8949 and Schedule D."
        ),
        expected_value=None,
        actual_value=wash_sale_amount,
    )]
