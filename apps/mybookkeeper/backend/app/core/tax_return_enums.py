"""Allowed values for tax returns — the single source of truth for both the
``tax_returns`` CheckConstraints and the request schemas that write them, so a
value the table would reject is a 422, not a 500.
"""
from app.core.sql_in_list import sql_in_list

FILING_STATUSES: tuple[str, ...] = (
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household",
    "qualifying_surviving_spouse",
)
FILING_STATUSES_SQL = sql_in_list(FILING_STATUSES)

MIN_TAX_RETURN_YEAR = 2020
MAX_TAX_RETURN_YEAR = 2099

JURISDICTION_MAX_LENGTH = 50
