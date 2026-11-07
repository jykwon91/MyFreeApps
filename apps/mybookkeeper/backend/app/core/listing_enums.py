"""Canonical string values for the Listings domain.

Per RENTALS_PLAN.md §4.1: status / category columns use `String(N) + CheckConstraint`,
never `SQLAlchemy Enum`. These tuples are the single source of truth — referenced from
both the SQLAlchemy model `CheckConstraint`s and the Alembic migration DDL.
"""
from app.core.sql_in_list import sql_in_list


LISTING_ROOM_TYPES: tuple[str, ...] = ("private_room", "whole_unit", "shared")
LISTING_STATUSES: tuple[str, ...] = ("active", "paused", "draft", "archived")
LISTING_EXTERNAL_SOURCES: tuple[str, ...] = ("FF", "TNH", "Airbnb", "direct")


LISTING_ROOM_TYPES_SQL = sql_in_list(LISTING_ROOM_TYPES)
LISTING_STATUSES_SQL = sql_in_list(LISTING_STATUSES)
LISTING_EXTERNAL_SOURCES_SQL = sql_in_list(LISTING_EXTERNAL_SOURCES)
