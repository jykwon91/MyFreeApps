"""Which exceptions the Sentry scrubber treats as database errors."""

from __future__ import annotations

import asyncpg
import pytest

from platform_shared.core.database_error_detection import is_database_error
from tests.database_error_samples import (
    bad_input,
    driver_error_of,
    sqlite_pending_rollback,
    sqlite_unique_violation,
    statement_error_from_value_error,
    unique_violation,
)


class _AppUniqueViolation(asyncpg.exceptions.UniqueViolationError):
    """An app's own subclass of a driver error."""


def test_the_wrapper_the_adapter_error_and_the_driver_error_all_count() -> None:
    wrapped = unique_violation()
    assert is_database_error(wrapped)
    assert is_database_error(wrapped.orig)
    assert is_database_error(driver_error_of(wrapped))


def test_a_sqlite_error_counts() -> None:
    assert is_database_error(sqlite_unique_violation().orig)


def test_a_statement_error_counts_whatever_it_wraps() -> None:
    wrapped = statement_error_from_value_error()
    assert is_database_error(wrapped)
    assert not is_database_error(wrapped.orig)


def test_a_subclass_defined_elsewhere_counts() -> None:
    assert is_database_error(_AppUniqueViolation("duplicate key"))


def test_the_codec_error_beneath_a_driver_error_does_not_count_by_itself() -> None:
    """It is withheld for being beneath one (see DatabaseErrorContext), not for itself."""
    codec_error = driver_error_of(bad_input()).__cause__
    assert isinstance(codec_error, ValueError)
    assert not is_database_error(codec_error)


def test_an_error_that_repeats_a_database_errors_text_does_not_count() -> None:
    """The text fallback handles it."""
    assert not is_database_error(sqlite_pending_rollback())


@pytest.mark.parametrize(
    "error",
    [
        ValueError("token expired"),
        OSError("Connect call failed"),
        type("Error", (Exception,), {"__module__": "asyncpgx.errors"})("lookalike"),
        type("Error", (Exception,), {"__module__": None})("no module"),
    ],
    ids=["builtin", "os-error", "module-sharing-a-prefix", "module-not-a-string"],
)
def test_other_errors_do_not_count(error: BaseException) -> None:
    assert not is_database_error(error)
