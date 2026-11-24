"""Withhold database error text found in a string with no exception object behind it.

A log message built with an f-string or ``str(exc)`` still carries the
database's message, but there is no exception object left to summarise. This
is the last line: it recognises only the formats SQLAlchemy, SQLAlchemy's
asyncpg adapter and Postgres write, and withholds from where the database text
starts to the end of the string, because nothing reliable marks where that
text stops.

A driver's own message logged on its own is not recognised. Postgres puts
some values in the first line (``invalid input syntax for type uuid:
"<value>"``), and that line has no prefix to tell it from any other text.
The Sentry hooks replace such text only while the exception it came from is
reachable, so code should log the exception rather than ``str(exc)``.
"""

from __future__ import annotations

import re

from platform_shared.core.database_error_constants import (
    DATABASE_TEXT_START,
    STATEMENT_ERROR_PREFIX,
    STATEMENT_SQL_LINE,
    WITHHELD_MARKER,
)


def withhold_database_text(text: str) -> str:
    """``text`` cut after the prefix that starts its database error text, then the marker.

    ``"save failed: (sqlite3.IntegrityError) UNIQUE ...\\n[SQL: ...]\\n[parameters: ...]"``
    becomes ``"save failed: (sqlite3.IntegrityError) [database message withheld]"``.
    Text without one is returned unchanged; applying it twice changes nothing more.
    """
    start = _database_text_start(text)
    if start is None:
        return text
    return text[: start.end()] + WITHHELD_MARKER


def _database_text_start(text: str) -> re.Match[str] | None:
    starts: list[re.Match[str]] = []
    database_start = DATABASE_TEXT_START.search(text)
    if database_start is not None:
        starts.append(database_start)
    sql_line = STATEMENT_SQL_LINE.search(text)
    if sql_line is not None:
        statement_start = STATEMENT_ERROR_PREFIX.search(text, 0, sql_line.start())
        if statement_start is not None:
            starts.append(statement_start)
    return min(starts, key=lambda match: match.start(), default=None)


__all__ = ["withhold_database_text"]
