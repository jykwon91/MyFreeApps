from app.core.tags import CATEGORY_TO_SCHEDULE_A, CATEGORY_TO_SCHEDULE_C, CATEGORY_TO_SCHEDULE_E


def resolve_tax_line(category: str, tax_form: str) -> str | None:
    """Map a category to a tax form line based on the activity's tax form.

    Args:
        category: The transaction category
        tax_form: The activity's tax form ('schedule_e', 'schedule_c', 'schedule_a', etc.)

    Returns:
        The form line identifier or None if no mapping exists.
    """
    if tax_form == "schedule_e":
        return CATEGORY_TO_SCHEDULE_E.get(category)
    if tax_form == "schedule_c":
        return CATEGORY_TO_SCHEDULE_C.get(category)
    if tax_form == "schedule_a":
        return CATEGORY_TO_SCHEDULE_A.get(category)
    return None
