"""Shared types and helpers for tax validation rules."""
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from app.core.tax_constants import TAX_BRACKETS
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance

FormFieldIndex = dict[str, dict[str, list[tuple[TaxFormField, TaxFormInstance]]]]


@dataclass(frozen=True, slots=True)
class ValidationResult:
    severity: Literal["error", "warning", "info"]
    form_name: str
    field_id: str | None
    message: str
    expected_value: Decimal | None
    actual_value: Decimal | None


def index_fields(instances: list[TaxFormInstance]) -> FormFieldIndex:
    """Build {form_name: {field_id: [(field, instance)]}} index."""
    index: FormFieldIndex = {}
    for inst in instances:
        if inst.form_name not in index:
            index[inst.form_name] = {}
        for f in inst.fields:
            if f.field_id not in index[inst.form_name]:
                index[inst.form_name][f.field_id] = []
            index[inst.form_name][f.field_id].append((f, inst))
    return index


def sum_field(
    form_fields: FormFieldIndex, form_name: str, field_id: str,
) -> Decimal:
    entries = form_fields.get(form_name, {}).get(field_id, [])
    return sum(
        (f.value_numeric for f, _ in entries if f.value_numeric is not None),
        Decimal("0"),
    )


def estimate_tax_liability(
    tax_year: int, filing_status: str, taxable_income: Decimal,
) -> Decimal:
    """Estimate federal income tax using simplified brackets."""
    brackets = TAX_BRACKETS.get(tax_year, {}).get(filing_status)
    if not brackets:
        latest_year = max(TAX_BRACKETS) if TAX_BRACKETS else None
        if latest_year:
            brackets = TAX_BRACKETS[latest_year].get(filing_status)
    if not brackets:
        return Decimal("0")

    tax = Decimal("0")
    prev_limit = Decimal("0")
    for limit, rate in brackets:
        if taxable_income <= prev_limit:
            break
        bracket_income = min(taxable_income, limit) - prev_limit
        tax += (bracket_income * rate).quantize(Decimal("0.01"))
        prev_limit = limit
    return tax
