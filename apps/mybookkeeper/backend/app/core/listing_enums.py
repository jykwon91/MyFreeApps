"""Canonical string values for the Listings domain.

Per RENTALS_PLAN.md §4.1: status / category columns use `String(N) + CheckConstraint`,
never `SQLAlchemy Enum`. These tuples are the single source of truth — referenced from
both the SQLAlchemy model `CheckConstraint`s and the Alembic migration DDL.
"""

LISTING_ROOM_TYPES: tuple[str, ...] = ("private_room", "whole_unit", "shared")
LISTING_STATUSES: tuple[str, ...] = ("active", "paused", "draft", "archived")
LISTING_EXTERNAL_SOURCES: tuple[str, ...] = ("FF", "TNH", "Airbnb", "direct")


def _sql_in_list(values: tuple[str, ...]) -> str:
    """Format a tuple of strings as a SQL IN-list expression: ('a', 'b', 'c')."""
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


LISTING_ROOM_TYPES_SQL = _sql_in_list(LISTING_ROOM_TYPES)
LISTING_STATUSES_SQL = _sql_in_list(LISTING_STATUSES)
LISTING_EXTERNAL_SOURCES_SQL = _sql_in_list(LISTING_EXTERNAL_SOURCES)
