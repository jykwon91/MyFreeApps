"""Rental property validation rules (Schedule E, depreciation, PAL, §280A)."""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import (
    PAL_PHASEOUT_END,
    PAL_PHASEOUT_START,
    PAL_SPECIAL_ALLOWANCE,
    TAX_FREE_RENTAL_DAYS,
)
from app.models.properties.property_classification import PropertyClassification
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import (
    property_repo,
    reservation_repo,
    tax_carryforward_repo,
    transaction_repo,
)

from ._types import FormFieldIndex, ValidationResult, sum_field


async def run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    form_fields: FormFieldIndex,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    results.extend(_validate_schedule_e_math(all_instances))
    results.extend(await _validate_missing_depreciation(db, tax_return, all_instances))
    results.extend(await _validate_mortgage_principal(db, tax_return))
    results.extend(await _validate_personal_use_days(db, tax_return))
    results.extend(await _validate_security_deposits(db, tax_return))
    results.extend(_validate_passive_activity_loss(form_fields))
    results.extend(_validate_rental_income_without_expenses(all_instances))
    results.extend(await _validate_pal_carryforward(db, tax_return, form_fields))
    results.extend(await _validate_14_day_rental(db, tax_return))
    results.extend(_validate_rental_without_1099k(form_fields))
    results.extend(_validate_depreciation_dollar_impact(form_fields, all_instances))
    results.extend(await _validate_cleaning_fee_mismatch(db, tax_return))
    results.extend(_validate_multi_property_allocation(all_instances))
    return results


def _validate_schedule_e_math(
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 3: For each Schedule E property, Line 3 - Line 20 should equal Line 21."""
    results: list[ValidationResult] = []
    for inst in instances:
        if inst.form_name != "schedule_e" or inst.property_id is None:
            continue

        field_map: dict[str, Decimal] = {}
        for f in inst.fields:
            if f.value_numeric is not None:
                field_map[f.field_id] = f.value_numeric

        line_3 = field_map.get("line_3", Decimal("0"))
        line_20 = field_map.get("line_20", Decimal("0"))
        line_21 = field_map.get("line_21")

        if line_21 is None:
            continue

        expected_21 = line_3 - line_20
        if expected_21 != line_21:
            results.append(ValidationResult(
                severity="error",
                form_name="schedule_e",
                field_id="line_21",
                message=(
                    f"Schedule E math error for {inst.instance_label}: "
                    f"Line 3 ({line_3}) - Line 20 ({line_20}) = {expected_21}, "
                    f"but Line 21 = {line_21}"
                ),
                expected_value=expected_21,
                actual_value=line_21,
            ))

    return results


async def _validate_missing_depreciation(
    db: AsyncSession,
    tax_return: TaxReturn,
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 6: Properties with purchase_price but no Form 4562 -> warning."""
    results: list[ValidationResult] = []

    props_with_4562: set[uuid.UUID] = set()
    for inst in instances:
        if inst.form_name == "form_4562" and inst.property_id:
            props_with_4562.add(inst.property_id)

    properties = await property_repo.list_active_with_purchase_price(
        db, tax_return.organization_id
    )

    for prop in properties:
        if prop.id not in props_with_4562:
            results.append(ValidationResult(
                severity="warning",
                form_name="form_4562",
                field_id=None,
                message=(
                    f"Property '{prop.name}' has a purchase price but no "
                    f"Form 4562 depreciation. Check if date_placed_in_service "
                    f"and land_value are set."
                ),
                expected_value=None,
                actual_value=None,
            ))

    return results


async def _validate_mortgage_principal(
    db: AsyncSession, tax_return: TaxReturn
) -> list[ValidationResult]:
    """Rule 8: Mortgage principal transactions are not deductible."""
    count = await transaction_repo.count_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "mortgage_principal"
    )

    if count > 0:
        return [ValidationResult(
            severity="warning",
            form_name="schedule_e",
            field_id=None,
            message=(
                f"Found {count} mortgage principal payment(s). "
                f"Mortgage principal is not tax-deductible and should not "
                f"appear on Schedule E."
            ),
            expected_value=None,
            actual_value=None,
        )]
    return []


async def _validate_personal_use_days(
    db: AsyncSession, tax_return: TaxReturn
) -> list[ValidationResult]:
    """Rule 9: IRC §280A — personal use exceeding threshold limits rental deductions."""
    results: list[ValidationResult] = []

    properties = await property_repo.list_active(db, tax_return.organization_id)
    props_with_personal_use = [
        p for p in properties
        if (p.personal_use_days or 0) > 0
        and p.classification == PropertyClassification.INVESTMENT
    ]
    if not props_with_personal_use:
        return results

    rental_nights = await reservation_repo.total_nights_by_property(
        db, tax_return.organization_id, tax_return.tax_year,
    )

    for prop in props_with_personal_use:
        personal_days = prop.personal_use_days or 0
        rental_days = rental_nights.get(prop.id, 0)
        threshold = max(14, int(rental_days * 0.10))

        if personal_days > threshold:
            total_days = personal_days + rental_days
            rental_pct = (
                f"{rental_days}/{total_days} = {rental_days * 100 // total_days}%"
                if total_days > 0 else "N/A"
            )
            label = prop.address or prop.name
            results.append(ValidationResult(
                severity="warning",
                form_name="schedule_e",
                field_id=None,
                message=(
                    f"Property '{label}' has {personal_days} personal use days, "
                    f"exceeding the IRC §280A threshold of {threshold} days "
                    f"(the greater of 14 days or 10% of {rental_days} rental days). "
                    f"Rental expense deductions may be limited to the proportion "
                    f"of rental use ({rental_pct}), and rental losses cannot exceed "
                    f"rental income. Verify this limitation in your tax software."
                ),
                expected_value=Decimal(str(threshold)),
                actual_value=Decimal(str(personal_days)),
            ))

    return results


async def _validate_security_deposits(
    db: AsyncSession, tax_return: TaxReturn
) -> list[ValidationResult]:
    """Rule 10: Security deposits are not taxable income until forfeited."""
    count = await transaction_repo.count_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "security_deposit"
    )

    if count == 0:
        return []

    total = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "security_deposit"
    )

    return [ValidationResult(
        severity="info",
        form_name="schedule_e",
        field_id=None,
        message=(
            f"Found {count} security deposit transaction(s) totaling ${total:,.2f}. "
            f"Security deposits are not taxable income when received — they become "
            f"taxable only if forfeited by the tenant (applied to unpaid rent or "
            f"damages). These transactions are excluded from Schedule E. If any "
            f"deposits were forfeited this year, reclassify them as 'rental_revenue' "
            f"so they appear on Schedule E Line 3."
        ),
        expected_value=None,
        actual_value=total,
    )]


def _validate_passive_activity_loss(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 11: PAL limitation — rental losses subject to $25K allowance and MAGI phase-out."""
    line_26 = sum_field(form_fields, "schedule_e", "line_26")

    if line_26 >= Decimal("0"):
        return []

    loss = abs(line_26)
    return [ValidationResult(
        severity="warning",
        form_name="schedule_e",
        field_id="line_26",
        message=(
            f"Schedule E shows a net rental loss of ${loss:,.2f}. Rental losses "
            f"are subject to passive activity loss rules (IRC §469). If you actively "
            f"participate in your rental activities, you may deduct up to "
            f"${PAL_SPECIAL_ALLOWANCE:,.0f} of rental losses against other income, "
            f"but this allowance phases out between ${PAL_PHASEOUT_START:,.0f} and "
            f"${PAL_PHASEOUT_END:,.0f} of modified AGI. If your modified AGI exceeds "
            f"${PAL_PHASEOUT_END:,.0f}, rental losses are fully suspended unless you "
            f"qualify as a real estate professional. Verify the allowable loss in "
            f"your tax software (Form 8582)."
        ),
        expected_value=None,
        actual_value=line_26,
    )]


def _validate_rental_income_without_expenses(
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 17: Rental property with income but suspiciously low expenses."""
    results: list[ValidationResult] = []

    for inst in instances:
        if inst.form_name != "schedule_e" or inst.property_id is None:
            continue

        field_map: dict[str, Decimal] = {}
        for f in inst.fields:
            if f.value_numeric is not None:
                field_map[f.field_id] = f.value_numeric

        income = field_map.get("line_3", Decimal("0"))
        expenses = field_map.get("line_20", Decimal("0"))

        if income < Decimal("5000"):
            continue

        if expenses > Decimal("0") and expenses / income >= Decimal("0.10"):
            continue

        missing: list[str] = []
        if field_map.get("line_9", Decimal("0")) == Decimal("0"):
            missing.append("insurance")
        if field_map.get("line_16", Decimal("0")) == Decimal("0"):
            missing.append("property taxes")
        if field_map.get("line_18", Decimal("0")) == Decimal("0"):
            missing.append("depreciation")

        label = inst.instance_label or "Unknown property"
        ratio = (
            f"{expenses / income * 100:.0f}%" if income > 0 else "0%"
        )
        hint = ""
        if missing:
            hint = f" Missing: {', '.join(missing)}."

        results.append(ValidationResult(
            severity="warning",
            form_name="schedule_e",
            field_id="line_20",
            message=(
                f"Property '{label}' shows ${income:,.2f} in rental income but "
                f"only ${expenses:,.2f} in expenses ({ratio}). Most rental "
                f"properties have insurance, property taxes, and depreciation "
                f"at minimum.{hint}"
            ),
            expected_value=None,
            actual_value=expenses,
        ))

    return results


async def _validate_pal_carryforward(
    db: AsyncSession, tax_return: TaxReturn, form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 21: PAL carryforward not applied — unused passive losses from prior years."""
    remaining = await tax_carryforward_repo.sum_remaining_for_year(
        db, tax_return.organization_id, tax_return.tax_year, "passive_activity_loss",
    )
    if remaining <= Decimal("0"):
        return []

    line_26 = sum_field(form_fields, "schedule_e", "line_26")
    if line_26 <= Decimal("0"):
        return [ValidationResult(
            severity="info",
            form_name="schedule_e",
            field_id="line_26",
            message=(
                f"You have ${remaining:,.2f} in passive activity loss carryforward "
                f"from prior years, but your current rental activity shows a loss. "
                f"The carryforward can only offset passive income."
            ),
            expected_value=None,
            actual_value=remaining,
        )]

    offset = min(remaining, line_26)
    tax_savings = (offset * Decimal("0.24")).quantize(Decimal("0.01"))
    return [ValidationResult(
        severity="warning",
        form_name="schedule_e",
        field_id="line_26",
        message=(
            f"You have ${remaining:,.2f} in passive activity loss carryforward "
            f"that can offset ${offset:,.2f} of this year's passive income "
            f"(${line_26:,.2f}), saving approximately ${tax_savings:,.2f} in taxes. "
            f"Ensure this carryforward is applied on Form 8582."
        ),
        expected_value=None,
        actual_value=remaining,
    )]


async def _validate_14_day_rental(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[ValidationResult]:
    """Rule 27: 14-day tax-free rental rule — §280A(g)."""
    properties = await property_repo.list_active(db, tax_return.organization_id)
    if not properties:
        return []

    rental_nights = await reservation_repo.total_nights_by_property(
        db, tax_return.organization_id, tax_return.tax_year,
    )

    results: list[ValidationResult] = []
    for prop in properties:
        nights = rental_nights.get(prop.id, 0)
        if 0 < nights < TAX_FREE_RENTAL_DAYS:
            label = prop.address or prop.name
            results.append(ValidationResult(
                severity="info",
                form_name="schedule_e",
                field_id=None,
                message=(
                    f"Property '{label}' was rented for only {nights} days. Under "
                    f"IRC §280A(g), rental income from properties rented fewer than "
                    f"15 days is tax-free and does not need to be reported. However, "
                    f"rental expenses for those days are also not deductible."
                ),
                expected_value=Decimal(str(TAX_FREE_RENTAL_DAYS)),
                actual_value=Decimal(str(nights)),
            ))

    return results


def _validate_rental_without_1099k(
    form_fields: FormFieldIndex,
) -> list[ValidationResult]:
    """Rule 28: Platform rental income without matching 1099-K."""
    se_line_3 = sum_field(form_fields, "schedule_e", "line_3")
    if se_line_3 < Decimal("5000"):
        return []

    k_box_1a = sum_field(form_fields, "1099_k", "box_1a")
    if k_box_1a > Decimal("0"):
        return []

    return [ValidationResult(
        severity="info",
        form_name="schedule_e",
        field_id="line_3",
        message=(
            f"Schedule E shows ${se_line_3:,.2f} in rental income but no 1099-K "
            f"was uploaded. If you use a booking platform (Airbnb, VRBO), they "
            f"issue a 1099-K for gross payments exceeding $5,000. Upload it to "
            f"ensure IRS matching."
        ),
        expected_value=None,
        actual_value=se_line_3,
    )]


def _validate_depreciation_dollar_impact(
    form_fields: FormFieldIndex, instances: list[TaxFormInstance],
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
        if inst.form_name in ("form_4562", "schedule_e") and inst.property_id:
            for f in inst.fields:
                if f.field_id in ("line_18", "depreciation") and f.value_numeric and f.value_numeric > Decimal("0"):
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


async def _validate_cleaning_fee_mismatch(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[ValidationResult]:
    """Rule 31: Cleaning fee revenue/expense mismatch."""
    cleaning_revenue = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "cleaning_fee_revenue",
    )
    cleaning_expense = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "cleaning_and_maintenance",
    )

    if cleaning_revenue <= Decimal("0") and cleaning_expense <= Decimal("0"):
        return []

    if cleaning_revenue > Decimal("0") and cleaning_expense <= Decimal("0"):
        return [ValidationResult(
            severity="warning",
            form_name="schedule_e",
            field_id="line_7",
            message=(
                f"You collected ${cleaning_revenue:,.2f} in cleaning fee revenue "
                f"but have no cleaning expenses recorded. This is unusual — cleaning "
                f"fees collected from guests typically offset cleaning costs paid "
                f"to cleaners."
            ),
            expected_value=None,
            actual_value=cleaning_expense,
        )]

    return []


def _validate_multi_property_allocation(
    instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    """Rule 32: Multi-property expense allocation check."""
    property_instances = [
        inst for inst in instances
        if inst.form_name == "schedule_e" and inst.property_id
    ]

    if len(property_instances) < 2:
        return []

    results: list[ValidationResult] = []
    no_expense_props: list[str] = []
    for inst in property_instances:
        expenses = Decimal("0")
        income = Decimal("0")
        for f in inst.fields:
            if f.field_id == "line_20" and f.value_numeric:
                expenses = f.value_numeric
            if f.field_id == "line_3" and f.value_numeric:
                income = f.value_numeric
        if income > Decimal("1000") and expenses == Decimal("0"):
            no_expense_props.append(inst.instance_label or "Unknown")

    if no_expense_props:
        results.append(ValidationResult(
            severity="warning",
            form_name="schedule_e",
            field_id="line_20",
            message=(
                f"You have {len(property_instances)} rental properties, but "
                f"{len(no_expense_props)} have income with no expenses: "
                f"{', '.join(no_expense_props)}. Verify expenses are allocated "
                f"to the correct property."
            ),
            expected_value=None,
            actual_value=None,
        ))

    return results
