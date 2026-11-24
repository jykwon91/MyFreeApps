"""Shared values for writing database errors without the data they carry."""

from __future__ import annotations

import re
from typing import Final

# An exception whose class, or any base class, is defined in one of these
# modules (or a submodule) is a database error: the drivers, and SQLAlchemy's
# DBAPI adapters, which re-raise a driver error under their own class.
DATABASE_ERROR_MODULES: Final[tuple[str, ...]] = (
    "asyncpg",
    "psycopg",
    "psycopg2",
    "sqlite3",
    "sqlalchemy.connectors",
    "sqlalchemy.dialects",
)

# Modules Python reports for built-in exception classes, which are named
# without one (``ValueError``, not ``builtins.ValueError``).
BUILTIN_MODULES: Final[frozenset[str]] = frozenset({"builtins", "__builtins__"})

# Sent in place of a database error's message, and of any exception raised
# beneath one (asyncpg chains the codec error that holds the rejected value).
WITHHELD_MARKER: Final = "[database message withheld]"

# What a database error summary keeps: (label, attributes to read in order).
# Drivers set these on the error (asyncpg, sqlite3) or on its ``diag``
# (psycopg); SQLAlchemy's asyncpg adapter copies the SQLSTATE as ``pgcode``.
# None of them holds row data.
SUMMARY_FIELDS: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    ("sqlstate", ("sqlstate", "pgcode")),
    ("sqlite_error", ("sqlite_errorname",)),
    ("constraint", ("constraint_name",)),
    ("table", ("table_name",)),
    ("column", ("column_name",)),
)

# Driver error attributes holding part of the error's text on their own
# (asyncpg's primary line and its DETAIL line), which a caller may log alone.
DRIVER_TEXT_ATTRIBUTES: Final[tuple[str, ...]] = ("message", "detail")

# Exception texts shorter than this are not searched for in other strings: a
# short text matches unrelated substrings, and every database error's own
# text is longer.
MIN_KNOWN_TEXT_LENGTH: Final = 16

# Where database error text starts in a string that has no exception object
# behind it: SQLAlchemy's "(module.Class) " prefix naming a driver or
# SQLAlchemy class, the "<class 'asyncpg...'>: " prefix SQLAlchemy's asyncpg
# adapter puts before asyncpg's text, and the Postgres "DETAIL:  " line that
# holds row values. "\\n" is a newline as repr writes it (``%r``, a list's text).
# The quotes in the adapter's prefix may be escaped ("<class \\'asyncpg...\\'>: "):
# the repr of a text holding both kinds of quote, such as the adapter's error
# for 'invalid input syntax for type uuid: "<value>"', escapes its single ones.
DATABASE_TEXT_START: Final = re.compile(
    r"\((?:sqlalchemy|asyncpg|psycopg2?|sqlite3)(?:\.\w+)+\) "
    r"|<class \\?'asyncpg(?:\.\w+)+\\?'>: "
    r"|(?:\n|\\n)DETAIL:  "
)

# SQLAlchemy's prefix for a statement error wrapping a non-database exception
# (a ValueError from a type processor, say). Only a start when the same text
# goes on to SQLAlchemy's "[SQL: " line.
STATEMENT_ERROR_PREFIX: Final = re.compile(r"\([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+\) ")
STATEMENT_SQL_LINE: Final = re.compile(r"(?:\n|\\n)\[SQL: ")

__all__ = [
    "BUILTIN_MODULES",
    "DATABASE_ERROR_MODULES",
    "DATABASE_TEXT_START",
    "DRIVER_TEXT_ATTRIBUTES",
    "MIN_KNOWN_TEXT_LENGTH",
    "STATEMENT_ERROR_PREFIX",
    "STATEMENT_SQL_LINE",
    "SUMMARY_FIELDS",
    "WITHHELD_MARKER",
]
