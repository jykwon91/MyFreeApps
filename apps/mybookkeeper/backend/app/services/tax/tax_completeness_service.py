"""Tax completeness analysis — field coverage and highlights per form."""
import uuid
from decimal import Decimal, InvalidOperation

from app.core.tax_constants import (
    SCHEDULE_C_LINE_LABELS,
    SCHEDULE_E_AGGREGATE_LABEL,
    SCHEDULE_E_LINE_LABELS,
    SCHEDULE_SE_LABELS,
)
from app.core.tax_form_fields import TAX_FORM_FIELD_DEFINITIONS
from app.db.session import AsyncSessionLocal
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.repositories import tax_return_repo
from app.schemas.tax.tax_completeness import FormCompleteness, TaxCompletenessResponse

EXPECTED_FIELDS_BY_FORM: dict[str, dict[str, str]] = {}

for _form_name, _field_list in TAX_FORM_FIELD_DEFINITIONS.items():
    EXPECTED_FIELDS_BY_FORM[_form_name] = {fid: flabel for fid, flabel in _field_list}

# Line 26 is the total across properties, so it's never on a property's own form.
EXPECTED_FIELDS_BY_FORM["schedule_e"] = {
    line_id: label for line_id, label in SCHEDULE_E_LINE_LABELS.items() if line_id != "line_26"
}
EXPECTED_FIELDS_BY_FORM["schedule_c"] = SCHEDULE_C_LINE_LABELS
EXPECTED_FIELDS_BY_FORM["schedule_se"] = SCHEDULE_SE_LABELS


def _has_value(field: TaxFormField) -> bool:
    """A stored $0 is a value: recompute writes it on purpose, so it isn't missing."""
    if field.value_numeric is not None:
        return True
    if field.value_text is not None and field.value_text.strip():
        return True
    return field.value_boolean is not None


def _is_zero_text(text: str | None) -> bool:
    """Form extraction stores a numeric 0 as the text "0" or "0.0"."""
    if text is None:
        return False
    try:
        return Decimal(text.strip()) == 0
    except InvalidOperation:
        return False


def _has_amount(field: TaxFormField) -> bool:
    """Whether a highlight can say something was found. A $0 isn't income, or a mortgage."""
    if not _has_value(field) or field.value_numeric == Decimal("0"):
        return False
    return not _is_zero_text(field.value_text)


def _real_label(form_name: str, instance_label: str | None) -> str | None:
    """Form extraction labels a form with its own type when there's no issuer. That names nothing."""
    if instance_label and instance_label.upper() != form_name.upper():
        return instance_label
    return None


def _is_aggregate(instance: TaxFormInstance) -> bool:
    """The Schedule E total recompute adds holds line 26 for all properties. It isn't a form to review."""
    return (
        instance.form_name == "schedule_e"
        and instance.property_id is None
        and instance.instance_label == SCHEDULE_E_AGGREGATE_LABEL
    )


def _generate_highlights(
    form_name: str,
    instance_label: str | None,
    with_amount: set[str],
    without_amount: set[str],
) -> list[str]:
    """Things worth a second look. Empty is fine: it says nothing about whether a form is complete."""
    highlights: list[str] = []

    if form_name == "schedule_e":
        label = instance_label or "this property"
        if "line_3" in with_amount:
            highlights.append(f"Rental income found for {label}.")
        if "line_12" in without_amount:
            highlights.append(f"No mortgage interest for {label} — do you have a mortgage?")
        if "line_9" in without_amount:
            highlights.append(f"No insurance expense for {label} — is that covered elsewhere?")
        if "line_18" in without_amount:
            highlights.append(f"No depreciation for {label} — ask your accountant whether you can claim it.")

    elif form_name == "schedule_c":
        if "line_1" in with_amount:
            highlights.append("Business income found.")
        if "line_30" in without_amount:
            highlights.append("No home office deduction — do you work from home?")

    elif form_name == "w2":
        if "box_1" in with_amount:
            highlights.append(f"Wages reported from {instance_label or 'this W-2'}.")
        if "box_12a" in without_amount and "box_12b" in without_amount:
            highlights.append("No Box 12 codes found — check for retirement contributions.")

    elif form_name == "1098":
        if "box_1" in with_amount:
            highlights.append(f"Mortgage interest reported for {instance_label or 'this mortgage'}.")

    return highlights


def _generate_summary(forms: list[FormCompleteness]) -> str:
    """What I have on file. Never how complete it is: most boxes on a form don't apply to most people."""
    if not forms:
        return "I don't have any tax forms for this year yet. Upload some documents and I'll start filling things in."

    parts: list[str] = []

    property_count = sum(1 for f in forms if f.form_name == "schedule_e")
    if property_count:
        parts.append(f"I have {property_count} rental propert{'ies' if property_count != 1 else 'y'}.")

    if any(f.form_name == "schedule_c" for f in forms):
        parts.append("I have a Schedule C for your business income.")

    w2_count = sum(1 for f in forms if f.form_name == "w2")
    if w2_count:
        parts.append(f"I have {w2_count} W-2{'s' if w2_count != 1 else ''} on file.")

    source_count = sum(1 for f in forms if f.form_name.startswith("1099") or f.form_name in {"1098", "k1"})
    if source_count:
        parts.append(f"I have {source_count} other tax form{'s' if source_count != 1 else ''} on file.")

    return " ".join(parts) or "I have some forms on file but need more data to give you a useful summary."


async def get_tax_completeness(
    organization_id: uuid.UUID,
    tax_year: int,
) -> TaxCompletenessResponse | None:
    """Compute tax completeness for a given org and tax year.

    Returns None if no tax return exists for the given year.
    """
    async with AsyncSessionLocal() as db:
        tax_return = await tax_return_repo.get_by_org_year(
            db, organization_id, tax_year,
        )
        if not tax_return:
            return None

        instances = await tax_return_repo.get_all_form_instances(
            db, tax_return.id,
        )

    forms: list[FormCompleteness] = []

    for instance in instances:
        if _is_aggregate(instance):
            continue

        expected = EXPECTED_FIELDS_BY_FORM.get(instance.form_name, {})
        expected_ids = set(expected.keys())

        fields = [field for field in instance.fields if field.field_id in expected_ids]
        filled_ids = {field.field_id for field in fields if _has_value(field)}
        with_amount = {field.field_id for field in fields if _has_amount(field)}

        missing_ids = expected_ids - filled_ids

        label = _real_label(instance.form_name, instance.instance_label)
        highlights = _generate_highlights(
            instance.form_name,
            label,
            with_amount,
            expected_ids - with_amount,
        )

        forms.append(
            FormCompleteness(
                form_name=instance.form_name,
                instance_label=label,
                filled_fields=sorted(filled_ids),
                missing_fields=sorted(missing_ids),
                total_expected=len(expected_ids),
                total_filled=len(filled_ids),
                highlights=highlights,
            )
        )

    summary = _generate_summary(forms)

    return TaxCompletenessResponse(
        tax_year=tax_year,
        tax_return_id=tax_return.id,
        needs_recompute=tax_return.needs_recompute,
        forms=forms,
        summary=summary,
    )
