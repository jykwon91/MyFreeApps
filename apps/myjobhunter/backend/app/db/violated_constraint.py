"""Name the database constraint behind an ``IntegrityError``."""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError


def violated_constraint_name(exc: IntegrityError) -> str | None:
    """Return the constraint (or unique index) name ``exc`` violated, if known.

    SQLAlchemy's asyncpg adapter wraps the driver error; the original asyncpg
    exception, which carries ``constraint_name``, is its ``__cause__``.
    """
    driver_error = getattr(exc.orig, "__cause__", None) or exc.orig
    return getattr(driver_error, "constraint_name", None)
