"""Tax form mapper — normalizes Claude's varied tax form output to internal format."""
import logging
from decimal import Decimal
from typing import NamedTuple

from app.core.parsers import safe_decimal
from app.core.tax_form_fields import (
    FIELD_TYPE_BOOLEAN,
    FIELD_TYPE_NUMERIC,
    FIELD_TYPE_TEXT,
    declared_field_type,
)

logger = logging.getLogger(__name__)


class FieldValueColumns(NamedTuple):
    """The three TaxFormField value columns; a field holds one at most."""

    numeric: Decimal | None = None
    text: str | None = None
    boolean: bool | None = None

FORM_TYPE_MAP: dict[str, str] = {
    "1099-misc": "1099_misc", "1099-nec": "1099_nec", "1099-k": "1099_k",
    "1099-int": "1099_int", "1099-div": "1099_div", "1099-b": "1099_b",
    "1099-r": "1099_r", "1098": "1098", "w-2": "w2", "w2": "w2", "k-1": "k1",
}

FIELD_KEY_MAP: dict[str, str] = {
    "box_1_rents": "box_1", "box_1": "box_1",
    "box_2_royalties": "box_2", "box_2": "box_2",
    "box_3_other_income": "box_3", "box_3": "box_3",
    "box_4_federal_income_tax_withheld": "box_4", "box_4": "box_4",
    "box_10_gross_proceeds_paid_to_attorney": "box_10", "box_10": "box_10",
    "box_15_nonqualified_deferred_compensation": "box_15", "box_15": "box_15",
}


def normalize_tax_doc_type(doc_data: dict) -> str:
    """Map Claude's varied form type strings to our internal names."""
    for key in ("form_type", "document_type"):
        raw = doc_data.get(key, "")
        normalized = FORM_TYPE_MAP.get(raw.lower().strip(), "")
        if normalized:
            return normalized
    return doc_data.get("document_type", "")


def build_tax_form_data(doc_data: dict) -> dict | None:
    """Build tax_form_data from Claude's alternative output formats."""
    reported = doc_data.get("reported_amounts") or doc_data.get("fields")
    if not reported or not isinstance(reported, dict):
        return None

    tax_year = doc_data.get("tax_year")
    if isinstance(tax_year, str):
        try:
            tax_year = int(tax_year)
        except ValueError:
            tax_year = None

    fields: dict[str, object] = {}
    for key, value in reported.items():
        if value is None:
            continue
        mapped_key = FIELD_KEY_MAP.get(key, key)
        fields[mapped_key] = value

    if not fields:
        return None

    return {
        "tax_year": tax_year,
        "issuer_name": doc_data.get("payer") or doc_data.get("vendor"),
        "issuer_ein": doc_data.get("payer_ein") or doc_data.get("issuer_ein"),
        "fields": fields,
    }


def parse_amount(raw: object) -> Decimal | None:
    """Parse a money/count value, tolerating "$1,234.00" and "(1,234.00)"."""
    if raw is None or isinstance(raw, bool):
        return None
    if not isinstance(raw, str):
        return safe_decimal(str(raw))
    cleaned = raw.strip().replace("$", "").replace(",", "").replace(" ", "")
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    return safe_decimal(cleaned)


def split_extracted_value(
    form_name: str, field_id: str, raw: object,
) -> FieldValueColumns:
    """Choose the column an extracted value belongs in.

    A declared field keeps its value in its own type's column. A value that
    cannot be parsed as the declared type is kept as text and logged, never
    dropped. Undeclared fields keep the legacy inference.
    """
    if raw is None:
        return FieldValueColumns()
    declared = declared_field_type(form_name, field_id)
    if declared == FIELD_TYPE_TEXT:
        return FieldValueColumns(text=str(raw))
    if declared == FIELD_TYPE_NUMERIC:
        amount = parse_amount(raw)
        if amount is not None:
            return FieldValueColumns(numeric=amount)
        logger.warning(
            "Unparseable value for numeric field %s.%s; kept as text", form_name, field_id,
        )
        return FieldValueColumns(text=str(raw))
    if declared == FIELD_TYPE_BOOLEAN:
        if isinstance(raw, bool):
            return FieldValueColumns(boolean=raw)
        logger.warning(
            "Non-boolean value for boolean field %s.%s; kept as text", form_name, field_id,
        )
        return FieldValueColumns(text=str(raw))

    numeric = safe_decimal(raw)  # type: ignore[arg-type]
    if numeric is not None:
        return FieldValueColumns(numeric=numeric)
    if isinstance(raw, bool):
        return FieldValueColumns(boolean=raw)
    return FieldValueColumns(text=str(raw))


def _format_decimal(value: Decimal) -> str:
    return str(int(value)) if value == value.to_integral_value() else format(value.normalize(), "f")


def relocate_legacy_value(
    form_name: str, field_id: str, current: FieldValueColumns,
) -> FieldValueColumns | None:
    """Where a legacy row's value belongs, or None when it is fine as is.

    Only a lone value in the wrong column moves, and only when it converts
    cleanly. Rows holding several columns are ambiguous and left alone.
    """
    declared = declared_field_type(form_name, field_id)
    if declared == FIELD_TYPE_TEXT and current.numeric is not None:
        if current.text is None and current.boolean is None:
            return FieldValueColumns(text=_format_decimal(current.numeric))
    if declared == FIELD_TYPE_NUMERIC and current.text is not None:
        if current.numeric is None and current.boolean is None:
            amount = parse_amount(current.text)
            if amount is not None:
                return FieldValueColumns(numeric=amount)
    return None
