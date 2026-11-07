"""Canonical string values for the Vendors domain (rentals Phase 4).

Per RENTALS_PLAN.md §4.1: status / category columns use ``String(N)`` plus a
``CheckConstraint``, never ``SQLAlchemy Enum``. These tuples are the single
source of truth — referenced from both the SQLAlchemy model
``CheckConstraint`` and the Alembic migration DDL.

Mirrors ``app/core/applicant_enums.py`` (Phase 3) for consistency.
"""
from app.core.sql_in_list import sql_in_list


# Vendor trade categories. Keep this list aligned with RENTALS_PLAN.md §5.4 —
# every value here corresponds to a UI affordance in the rolodex (PR 4.1b).
VENDOR_CATEGORIES: tuple[str, ...] = (
    "handyman",
    "plumber",
    "electrician",
    "hvac",
    "locksmith",
    "cleaner",
    "pest",
    "landscaper",
    "general_contractor",
)


VENDOR_CATEGORIES_SQL = sql_in_list(VENDOR_CATEGORIES)
