"""Cross-document validation rules for tax returns.

Runs after recompute to catch inconsistencies, missing data, and IRS limits.
"""
import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import property_repo, tax_return_repo, transaction_repo

logger = logging.getLogger(__name__)

SALT_CAP = Decimal("10000")
CAPITAL_LOSS_LIMIT = Decimal("3000")

# Type alias for the field index to avoid repeating the long signature everywhere.
FormFieldIndex = dict[str, dict[str, list[tuple[TaxFormField, TaxFormInstance]]]]


@dataclass(frozen=True, slots=True)
class ValidationResult:
    severity: str  # "error" | "warning" | "info"
    form_name: str
    field_id: str | None
    message: str
    expected_value: Decimal | None
    actual_value: Decimal | None


async def validate(
    organization_id: uuid.UUID, tax_return_id: uuid.UUID
) -> list[ValidationResult]:
    """Run all validation rules and update field statuses. Returns results."""
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(db, tax_return_id, organization_id)
        if not tax_return:
            raise LookupError("Tax return not found")

        all_instances = await tax_return_repo.get_all_form_instances(db, tax_return.id)

        form_fields = _index_fields(all_instances)

        results: list[ValidationResult] = []
        results.extend(_validate_w2_wages(form_fields))
        results.extend(await _validate_1099k_cross(db, tax_return, form_fields))
        results.extend(_validate_schedule_e_math(all_instances))
        results.extend(_validate_capital_loss(form_fields))
        results.extend(_validate_salt_cap(form_fields))
        results.extend(await _validate_missing_depreciation(db, tax_return, all_instances))
        results.extend(_validate_duplicate_documents(all_instances))
        results.extend(await _validate_mortgage_principal(db, tax_return))

        await _update_field_statuses(db, all_instances, results)

        return results


def _index_fields(
    instances: list[TaxFormInstance],
) -> FormFieldIndex:
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


def _sum_field(
    form_fields: FormFieldIndex, form_name: str, field_id: str
) -> Decimal:
    entries = form_fields.get(form_name, {}).get(field_id, [])
    return sum(
        (f.value_numeric for f, _ in entries if f.value_numeric is not None),
        Decimal("0"),
    )


def _validate_w2_wages(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 1: Sum of W-2 box_1 values should equal 1040 Line 1a."""
    w2_sum = _sum_field(form_fields, "w2", "box_1")
    line_1a = _sum_field(form_fields, "1040", "line_1a")

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
    db: AsyncSession, tax_return: TaxReturn, form_fields: FormFieldIndex
) -> list[ValidationResult]:
    """Rule 2: 1099-K gross minus channel fees should approximate Schedule E Line 3."""
    results: list[ValidationResult] = []
    k_box_1a = _sum_field(form_fields, "1099_k", "box_1a")
    if k_box_1a == Decimal("0"):
        return results

    channel_fees = await transaction_repo.sum_by_category(
        db, tax_return.organization_id, tax_return.tax_year, "channel_fee"
    )

    expected_income = k_box_1a - channel_fees
    se_line_3 = _sum_field(form_fields, "schedule_e", "line_3")

    if se_line_3 > Decimal("0") and abs(expected_income - se_line_3) > Decimal("100"):
        results.append(ValidationResult(
            severity="warning",
            form_name="schedule_e",
            field_id="line_3",
            message=(
                f"1099-K gross ({k_box_1a}) minus channel fees ({channel_fees}) = "
                f"{expected_income}, but Schedule E Line 3 = {se_line_3}"
            ),
            expected_value=expected_income,
            actual_value=se_line_3,
        ))

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


def _validate_capital_loss(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 4: If Schedule D shows net loss > $3,000, warn about limitation."""
    sched_d_net = _sum_field(form_fields, "schedule_d", "net_gain_loss")
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


def _validate_salt_cap(form_fields: FormFieldIndex) -> list[ValidationResult]:
    """Rule 5: If Schedule A Line 5d > $10,000, SALT cap error."""
    salt_total = _sum_field(form_fields, "schedule_a", "line_5d")
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


async def _update_field_statuses(
    db: AsyncSession,
    instances: list[TaxFormInstance],
    results: list[ValidationResult],
) -> None:
    """Update validation_status and validation_message on affected fields."""
    field_issues: dict[tuple[str, str | None], ValidationResult] = {}
    for r in results:
        if r.field_id and r.severity in ("error", "warning"):
            key = (r.form_name, r.field_id)
            existing = field_issues.get(key)
            if existing is None or (r.severity == "error" and existing.severity != "error"):
                field_issues[key] = r

    for inst in instances:
        for f in inst.fields:
            key = (inst.form_name, f.field_id)
            issue = field_issues.get(key)
            if issue:
                f.validation_status = issue.severity
                f.validation_message = issue.message
            else:
                f.validation_status = "valid"
                f.validation_message = None
