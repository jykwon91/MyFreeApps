"""Whether an exception came from the database layer."""

from __future__ import annotations

from sqlalchemy.exc import StatementError

from platform_shared.core.database_error_constants import DATABASE_ERROR_MODULES


def is_database_error(exc: BaseException) -> bool:
    """True for a SQLAlchemy statement error and for an error a database driver raised.

    A statement error covers every ``DBAPIError``; a driver error is matched by
    the module that defines its class or a base class, so asyncpg, psycopg and
    sqlite3 errors, and SQLAlchemy's adapter classes around them, all count.
    """
    if isinstance(exc, StatementError):
        return True
    return any(
        _is_database_module(getattr(cls, "__module__", None))
        for cls in type(exc).__mro__
    )


def _is_database_module(module: object) -> bool:
    """``module`` is a class's ``__module__``, which code can set to anything."""
    if not isinstance(module, str):
        return False
    return any(
        module == name or module.startswith(f"{name}.")
        for name in DATABASE_ERROR_MODULES
    )


__all__ = ["is_database_error"]
