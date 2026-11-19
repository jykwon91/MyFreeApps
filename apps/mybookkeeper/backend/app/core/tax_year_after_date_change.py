from datetime import date


def tax_year_after_date_change(current_year: int, old_date: date, new_date: date) -> int:
    """Move the tax year with the date, unless someone chose a different year."""
    if current_year != old_date.year:
        return current_year
    return new_date.year
