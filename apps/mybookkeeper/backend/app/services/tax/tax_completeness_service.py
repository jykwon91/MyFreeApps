"""Tax completeness analysis — field coverage and highlights per form."""
import uuid
from decimal import Decimal

from app.core.tax_constants import (
    SCHEDULE_C_LINE_LABELS,
    SCHEDULE_E_LINE_LABELS,
    SCHEDULE_SE_LABELS,
)
from app.core.tax_form_fields import TAX_FORM_FIELD_DEFINITIONS
from app.db.session import AsyncSessionLocal
from app.models.tax.tax_form_field import TaxFormField
from app.repositories import tax_return_repo
from app.schemas.tax.tax_completeness import FormCompleteness, TaxCompletenessResponse

EXPECTED_FIELDS_BY_FORM: dict[str, dict[str, str]] = {}

for _form_name, _field_list in TAX_FORM_FIELD_DEFINITIONS.items():
    EXPECTED_FIELDS_BY_FORM[_form_name] = {fid: flabel for fid, flabel in _field_list}

EXPECTED_FIELDS_BY_FORM["schedule_e"] = SCHEDULE_E_LINE_LABELS
EXPECTED_FIELDS_BY_FORM["schedule_c"] = SCHEDULE_C_LINE_LABELS
EXPECTED_FIELDS_BY_FORM["schedule_se"] = SCHEDULE_SE_LABELS


def _has_value(field: TaxFormField) -> bool:
    if field.value_numeric is not None and field.value_numeric != Decimal("0"):
        return True
    if field.value_text is not None and field.value_text.strip():
        return True
    if field.value_boolean is not None:
        return True
    return False


def _generate_highlights(
    form_name: str,
    instance_label: str | None,
    filled_ids: set[str],
    missing_ids: set[str],
    expected: dict[str, str],
) -> list[str]:
    highlights: list[str] = []
    label = instance_label or form_name

    if form_name == "schedule_e":
        if "line_3" in filled_ids:
            highlights.append(f"Rental income found for {label}.")
        if "line_12" in missing_ids:
            highlights.append(
                f"No mortgage interest for {label} — do you have a mortgage?"
            )
        if "line_9" in missing_ids:
            highlights.append(
                f"No insurance expense for {label} — is that covered elsewhere?"
            )
        if "line_18" in missing_ids:
            highlights.append(
                f"No depreciation for {label} — you may be able to claim this."
            )

    elif form_name == "schedule_c":
        if "line_1" in filled_ids:
            highlights.append("Business income captured.")
        if "line_30" in missing_ids:
            highlights.append(
                "No home office deduction — do you work from home?"
            )

    elif form_name == "w2":
        if "box_1" in filled_ids:
            highlights.append(f"Wages reported from {label}.")
        if "box_12a" in missing_ids and "box_12b" in missing_ids:
            highlights.append("No Box 12 codes found — check for retirement contributions.")

    elif form_name.startswith("1099"):
        filled_count = len(filled_ids)
        if filled_count > 0:
            highlights.append(
                f"Found {filled_count} field{'s' if filled_count != 1 else ''} "
                f"reported on this {form_name.upper().replace('_', '-')}."
            )

    elif form_name == "1098":
        if "box_1" in filled_ids:
            highlights.append(f"Mortgage interest reported for {label}.")

    if not highlights:
        filled_pct = (len(filled_ids) / max(len(expected), 1)) * 100
        if filled_pct >= 80:
            highlights.append(f"This {form_name} looks mostly complete.")
        elif filled_pct >= 40:
            highlights.append(
                f"About half the fields are filled — review what's missing."
            )
        else:
            highlights.append(
                f"Only a few fields filled so far — this {form_name} needs attention."
            )

    return highlights


def _generate_summary(forms: list[FormCompleteness]) -> str:
    if not forms:
        return "I don't have any tax forms for this year yet. Upload some documents and I'll start filling things in."

    total_filled = sum(f.total_filled for f in forms)
    total_expected = sum(f.total_expected for f in forms)

    parts: list[str] = []

    schedule_e_forms = [f for f in forms if f.form_name == "schedule_e"]
    if schedule_e_forms:
        prop_count = len(schedule_e_forms)
        parts.append(
            f"I found income from {prop_count} rental "
            f"propert{'ies' if prop_count != 1 else 'y'}. "
            f"Schedule E is {'mostly complete' if all(f.total_filled / max(f.total_expected, 1) > 0.6 for f in schedule_e_forms) else 'still in progress'}."
        )
        for se in schedule_e_forms:
            missing_important = [
                m for m in se.missing_fields
                if m in {"line_12", "line_9", "line_18"}
            ]
            if missing_important and se.instance_label:
                labels = [SCHEDULE_E_LINE_LABELS.get(m, m) for m in missing_important]
                parts.append(
                    f"I'm missing {', '.join(labels).lower()} for {se.instance_label}."
                )

    schedule_c_forms = [f for f in forms if f.form_name == "schedule_c"]
    if schedule_c_forms:
        parts.append("Schedule C data is being tracked for your business income.")

    w2_forms = [f for f in forms if f.form_name == "w2"]
    if w2_forms:
        count = len(w2_forms)
        parts.append(f"I have {count} W-2{'s' if count != 1 else ''} on file.")

    source_forms = [f for f in forms if f.form_name.startswith("1099") or f.form_name == "1098" or f.form_name == "k1"]
    if source_forms:
        parts.append(f"{len(source_forms)} information return{'s' if len(source_forms) != 1 else ''} uploaded.")

    if total_expected > 0:
        pct = round(total_filled / total_expected * 100)
        parts.append(f"Overall, {pct}% of expected fields are filled ({total_filled}/{total_expected}).")

    if not parts:
        return "I have some forms on file but need more data to give you a useful summary."

    return " ".join(parts)


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
        expected = EXPECTED_FIELDS_BY_FORM.get(instance.form_name, {})
        expected_ids = set(expected.keys())

        filled_ids: set[str] = set()
        for field in instance.fields:
            if field.field_id in expected_ids and _has_value(field):
                filled_ids.add(field.field_id)

        missing_ids = expected_ids - filled_ids

        highlights = _generate_highlights(
            instance.form_name,
            instance.instance_label,
            filled_ids,
            missing_ids,
            expected,
        )

        forms.append(
            FormCompleteness(
                form_name=instance.form_name,
                instance_label=instance.instance_label,
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
        forms=forms,
        summary=summary,
    )
