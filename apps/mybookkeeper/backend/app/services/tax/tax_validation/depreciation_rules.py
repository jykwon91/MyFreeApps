"""Depreciation validation rules (Form 4562 and Schedule E line 18)."""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property_classification import PropertyClassification
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import property_repo

from ._types import FormFieldIndex, ValidationResult

# Where each form states a property's depreciation.
DEPRECIATION_FIELD_BY_FORM: dict[str, str] = {
    "schedule_e": "line_18",
    "form_4562": "depreciation_amount",
}


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(await _validate_missing_depreciation(db, tax_return, all_instances))
    results.extend(_validate_depreciation_dollar_impact(all_instances))
    return results


async def _validate_missing_depreciation(
    db: AsyncSession,
    tax_return: TaxReturn,
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 6: Rental properties with a purchase price but no Form 4562 -> warning."""
    results: list[ValidationResult] = []

    props_with_4562: set[uuid.UUID] = set()
    for inst in instances:
        if inst.form_name == "form_4562" and inst.property_id:
            props_with_4562.add(inst.property_id)

    properties = await property_repo.list_active_with_purchase_price(
        db, tax_return.organization_id
    )

    for prop in properties:
        if prop.classification != PropertyClassification.INVESTMENT:
            continue
        if prop.id not in props_with_4562:
            results.append(ValidationResult(
                severity="warning",
                form_name="form_4562",
                field_id=None,
                message=(
                    f"Property '{prop.name}' has a purchase price but no "
                    f"Form 4562 depreciation. Check that its land value and "
                    f"date placed in service are set."
                ),
                expected_value=None,
                actual_value=None,
            ))

    return results


def _validate_depreciation_dollar_impact(
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 29: Quantify the tax savings of missing depreciation."""
    results: list[ValidationResult] = []

    props_with_income: dict[uuid.UUID, Decimal] = {}
    for inst in instances:
        if inst.form_name == "schedule_e" and inst.property_id:
            for f in inst.fields:
                if f.field_id == "line_3" and f.value_numeric and f.value_numeric > Decimal("0"):
                    props_with_income[inst.property_id] = f.value_numeric

    props_with_depreciation: set[uuid.UUID] = set()
    for inst in instances:
        depreciation_field = DEPRECIATION_FIELD_BY_FORM.get(inst.form_name)
        if depreciation_field is None or not inst.property_id:
            continue
        for f in inst.fields:
            if f.field_id == depreciation_field and f.value_numeric and f.value_numeric > Decimal("0"):
                props_with_depreciation.add(inst.property_id)

    for prop_id, income in props_with_income.items():
        if prop_id in props_with_depreciation:
            continue
        estimated_depreciation = (income * Decimal("0.30")).quantize(Decimal("0.01"))
        tax_savings = (estimated_depreciation * Decimal("0.24")).quantize(Decimal("0.01"))

        results.append(ValidationResult(
            severity="warning",
            form_name="form_4562",
            field_id=None,
            message=(
                f"A rental property with ${income:,.2f} in income has no "
                f"depreciation claimed. Depreciation is typically 25-35% of "
                f"rental income for residential properties. Missing depreciation "
                f"could cost approximately ${tax_savings:,.2f} in taxes. Set "
                f"the property's purchase price, date placed in service, and "
                f"land value to enable automatic depreciation."
            ),
            expected_value=None,
            actual_value=Decimal("0"),
        ))

    return results
