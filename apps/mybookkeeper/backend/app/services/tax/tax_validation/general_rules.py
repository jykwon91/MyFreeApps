"""General cross-cutting validation rules (duplicates, uncategorized, estimated tax)."""
import datetime
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import estimated_tax_payment_repo, transaction_repo

from ._types import FormFieldIndex, ValidationResult, sum_field


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(_validate_duplicate_documents(all_instances))
    results.extend(await _validate_uncategorized_transactions(db, tax_return))
    results.extend(await _validate_estimated_tax_penalty(db, tax_return, form_fields))
    results.extend(await _validate_yoy_expense_anomaly(db, tax_return, form_fields))
    results.extend(_validate_duplicate_ein_across_forms(all_instances))
    results.extend(await _validate_estimated_payment_timing(db, tax_return))
    return results


def _validate_duplicate_documents(
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 7: Same EIN + same form type from the same document -> duplicate warning.

    Multiple instances with the same EIN from different documents are valid
    (e.g., two 1098s from the same lender for different properties).
    """
    results: list[ValidationResult] = []
    seen: dict[tuple[str, str], list[tuple[str, uuid.UUID | None]]] = {}

    for inst in instances:
        if not inst.issuer_ein:
            continue
        key = (inst.issuer_ein, inst.form_name)
        label = inst.issuer_name or inst.instance_label or str(inst.id)
        if key not in seen:
            seen[key] = []
        seen[key].append((label, inst.document_id))

    for (ein, form_name), entries in seen.items():
        # Only flag if multiple instances share the same document_id (true duplicates)
        doc_ids = {doc_id for _, doc_id in entries if doc_id is not None}
        if len(entries) > 1 and len(doc_ids) < len(entries):
            labels = [label for label, _ in entries]
            results.append(ValidationResult(
                severity="warning",
                form_name=form_name,
                field_id=None,
                message=(
                    f"Possible duplicate: EIN {ein} "
                    f"appears in {len(labels)} {form_name} instances: "
                    f"{', '.join(labels)}"
                ),
                expected_value=None,
                actual_value=None,
            ))

    return results


async def _validate_uncategorized_transactions(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[ValidationResult]:
    """Rule 18: Approved uncategorized transactions are potential missed deductions."""
    count = await transaction_repo.count_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "uncategorized"
    )

    if count == 0:
        return []

    total = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "uncategorized"
    )

    return [ValidationResult(
        severity="warning",
        form_name="1040",
        field_id=None,
        message=(
            f"You have {count} approved transaction(s) totaling ${abs(total):,.2f} "
            f"categorized as 'uncategorized'. These will not appear on any tax "
            f"schedule. Review and categorize them to ensure deductions are not "
            f"missed and income is not underreported."
        ),
        expected_value=None,
        actual_value=total,
    )]


async def _validate_estimated_tax_penalty(
    db: AsyncSession, tax_return: TaxReturn, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 23: Estimated tax penalty risk for non-wage income."""
    se_income = sum_field(form_fields, "schedule_c", "line_29_net_profit")
    rental_income = sum_field(form_fields, "schedule_e", "line_26")
    investment_income = (
        sum_field(form_fields, "1099_int", "box_1")
        + sum_field(form_fields, "1099_div", "box_1a")
        + sum_field(form_fields, "schedule_d", "net_gain_loss")
    )
    non_wage_income = (
        max(se_income, Decimal("0"))
        + max(rental_income, Decimal("0"))
        + max(investment_income, Decimal("0"))
    )

    if non_wage_income < Decimal("4000"):
        return []

    payment_count = await estimated_tax_payment_repo.count_for_year(
        db, tax_return.organization_id, tax_return.tax_year,
    )

    if payment_count >= 4:
        return []

    total_paid = await estimated_tax_payment_repo.sum_for_year(
        db, tax_return.organization_id, tax_return.tax_year,
    )

    if payment_count == 0:
        return [ValidationResult(
            severity="warning",
            form_name="1040",
            field_id=None,
            message=(
                f"You have ${non_wage_income:,.2f} in non-wage income but no "
                f"estimated tax payments recorded. If your total tax liability "
                f"exceeds withholding by $1,000+, you may face an underpayment "
                f"penalty (Form 2210). Consider making quarterly estimated payments."
            ),
            expected_value=None,
            actual_value=non_wage_income,
        )]

    return [ValidationResult(
        severity="info",
        form_name="1040",
        field_id=None,
        message=(
            f"You have ${non_wage_income:,.2f} in non-wage income and only "
            f"{payment_count} estimated payment(s) totaling ${total_paid:,.2f}. "
            f"Typically 4 quarterly payments are required. Ensure your payments "
            f"meet the safe harbor to avoid penalties (Form 2210)."
        ),
        expected_value=None,
        actual_value=total_paid,
    )]


async def _validate_yoy_expense_anomaly(
    db: AsyncSession, tax_return: TaxReturn, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 30: Year-over-year expense anomaly detection."""
    current_year = tax_return.tax_year
    prior_year = current_year - 1

    current_expenses = await transaction_repo.sum_expenses_by_year(
        db, tax_return.organization_id, current_year,
    )
    prior_expenses = await transaction_repo.sum_expenses_by_year(
        db, tax_return.organization_id, prior_year,
    )

    if prior_expenses <= Decimal("0") or current_expenses <= Decimal("0"):
        return []

    change_pct = ((current_expenses - prior_expenses) / prior_expenses * 100).quantize(
        Decimal("1"),
    )

    if abs(change_pct) < 30:
        return []

    direction = "increased" if change_pct > 0 else "decreased"
    return [ValidationResult(
        severity="info",
        form_name="1040",
        field_id=None,
        message=(
            f"Total expenses {direction} by {abs(change_pct)}% from "
            f"{prior_year} (${prior_expenses:,.2f}) to {current_year} "
            f"(${current_expenses:,.2f}). Significant year-over-year changes "
            f"may trigger IRS scrutiny. Verify all expenses are documented."
        ),
        expected_value=prior_expenses,
        actual_value=current_expenses,
    )]


def _validate_duplicate_ein_across_forms(
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 42: Same EIN appearing across different form types — potential data entry issue."""
    ein_forms: dict[str, list[str]] = {}
    for inst in instances:
        if not inst.issuer_ein or inst.source_type == "computed":
            continue
        if inst.issuer_ein not in ein_forms:
            ein_forms[inst.issuer_ein] = []
        if inst.form_name not in ein_forms[inst.issuer_ein]:
            ein_forms[inst.issuer_ein].append(inst.form_name)

    results: list[ValidationResult] = []
    for ein, forms in ein_forms.items():
        if len(forms) < 2:
            continue
        expected_combos = {
            frozenset(["1098", "1099_int"]),
            frozenset(["w2", "1099_nec"]),
        }
        if frozenset(forms) in expected_combos:
            continue

        results.append(ValidationResult(
            severity="info",
            form_name="1040",
            field_id=None,
            message=(
                f"EIN {ein} appears across multiple form types: "
                f"{', '.join(sorted(forms))}. This may be expected (e.g., same "
                f"employer for W-2 and 1099) or may indicate a data entry issue."
            ),
            expected_value=None,
            actual_value=None,
        ))

    return results


async def _validate_estimated_payment_timing(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[ValidationResult]:
    """Rule 44: Estimated payment timing — check for late quarterly payments."""
    payments = await estimated_tax_payment_repo.list_for_year(
        db, tax_return.organization_id, tax_return.tax_year,
    )

    if not payments:
        return []

    year = tax_return.tax_year
    deadlines = {
        1: datetime.date(year, 4, 15),
        2: datetime.date(year, 6, 15),
        3: datetime.date(year, 9, 15),
        4: datetime.date(year + 1, 1, 15),
    }

    late_payments: list[str] = []
    for p in payments:
        deadline = deadlines.get(p.quarter)
        if deadline and p.payment_date > deadline:
            days_late = (p.payment_date - deadline).days
            late_payments.append(
                f"Q{p.quarter} (${p.amount:,.2f}) paid {days_late} days late",
            )

    if not late_payments:
        return []

    return [ValidationResult(
        severity="warning",
        form_name="1040",
        field_id=None,
        message=(
            f"Late estimated tax payments detected: {'; '.join(late_payments)}. "
            f"Late payments may incur interest and penalties even if the total "
            f"annual amount meets the safe harbor. Use Form 2210 to calculate."
        ),
        expected_value=None,
        actual_value=None,
    )]
