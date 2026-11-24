"""A database error described without the values its message carries."""

from __future__ import annotations

from sqlalchemy.exc import StatementError

from platform_shared.core.database_error_constants import (
    SUMMARY_FIELDS,
    WITHHELD_MARKER,
)
from platform_shared.core.database_error_detection import is_database_error
from platform_shared.core.exception_class_module import exception_class_module


def summarize_database_error(exc: BaseException) -> str:
    """The error's class, the driver error beneath it, the SQLSTATE and names the
    driver reports, and the SQL statement, whose values are placeholders.

    Never the message, which holds row values (``DETAIL:  Key (email)=(...)``,
    ``Failing row contains (...)``, the rejected argument) and bound parameters::

        sqlalchemy.exc.IntegrityError [database message withheld]
        cause=asyncpg.exceptions.UniqueViolationError sqlstate=23505
        constraint=users_email_key table=users [SQL: INSERT INTO users ...]

    (one line). It has no ``(module.Class) `` prefix and no newline before
    ``[SQL: ``, so the text fallback never mistakes it for raw database text.
    """
    chain = _database_error_chain(exc)
    parts = [_class_path(type(exc)), WITHHELD_MARKER]
    cause = _cause(chain[-1])
    if cause is not exc:
        parts.append(f"cause={_class_path(type(cause))}")
    sources = _attribute_sources(chain)
    for label, attributes in SUMMARY_FIELDS:
        value = _first_text(sources, attributes)
        if value is not None:
            parts.append(f"{label}={value}")
    if isinstance(exc, StatementError) and exc.statement:
        parts.append(f"[SQL: {exc.statement}]")
    return " ".join(parts)


def _database_error_chain(exc: BaseException) -> list[BaseException]:
    """``exc`` and each database error it wraps, outermost first."""
    chain = [exc]
    while True:
        current = chain[-1]
        inner = current.__cause__
        if isinstance(current, StatementError) and current.orig is not None:
            inner = current.orig
        if (
            inner is None
            or not is_database_error(inner)
            or any(inner is seen for seen in chain)
        ):
            return chain
        chain.append(inner)


def _cause(innermost: BaseException) -> BaseException:
    """The driver error, or what a statement error wraps when that isn't a database error."""
    if isinstance(innermost, StatementError) and innermost.orig is not None:
        return innermost.orig
    return innermost


def _attribute_sources(chain: list[BaseException]) -> list[object]:
    """Where the summary fields live, innermost (the driver's own error) first."""
    sources: list[object] = []
    for error in reversed(chain):
        sources.append(error)
        diag = getattr(error, "diag", None)
        if diag is not None:
            sources.append(diag)
    return sources


def _first_text(sources: list[object], attributes: tuple[str, ...]) -> str | None:
    for source in sources:
        for attribute in attributes:
            value = getattr(source, attribute, None)
            if isinstance(value, str) and value:
                return value
    return None


def _class_path(cls: type[BaseException]) -> str:
    module = exception_class_module(cls)
    if module is None:
        return cls.__qualname__
    return f"{module}.{cls.__qualname__}"


__all__ = ["summarize_database_error"]
