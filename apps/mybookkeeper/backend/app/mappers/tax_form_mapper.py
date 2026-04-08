"""Tax form mapper — normalizes Claude's varied tax form output to internal format."""

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
