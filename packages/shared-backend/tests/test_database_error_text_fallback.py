"""withhold_database_text: database error text in a string with no exception behind it."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from platform_shared.core.database_error_constants import WITHHELD_MARKER
from platform_shared.core.database_error_summary import summarize_database_error
from platform_shared.core.database_error_text_fallback import withhold_database_text
from tests.database_error_samples import (
    bad_input,
    check_violation,
    driver_error_of,
    invalid_text_representation,
    sqlite_pending_rollback,
    sqlite_unique_violation,
    statement_error_from_value_error,
    unique_violation,
)

_ASYNCPG_INTEGRITY_PREFIX = "(sqlalchemy.dialects.postgresql.asyncpg.IntegrityError) "


def test_a_sqlalchemy_message_is_cut_after_its_prefix() -> None:
    text = f"Saving the user failed: {unique_violation()}"
    assert withhold_database_text(text) == (
        f"Saving the user failed: {_ASYNCPG_INTEGRITY_PREFIX}{WITHHELD_MARKER}"
    )


def test_a_detail_line_after_a_newline_repr_wrote_out_is_cut() -> None:
    text = repr(str(driver_error_of(unique_violation())))
    assert withhold_database_text(text) == (
        "'duplicate key value violates unique constraint "
        f'"probe_users_email_key"\\nDETAIL:  {WITHHELD_MARKER}'
    )


def test_a_repr_is_cut() -> None:
    assert withhold_database_text(repr(bad_input())) == (
        f'DBAPIError("(sqlalchemy.dialects.postgresql.asyncpg.Error) {WITHHELD_MARKER}'
    )


def test_the_adapter_text_is_cut_after_the_asyncpg_class() -> None:
    assert withhold_database_text(str(unique_violation().orig)) == (
        f"<class 'asyncpg.exceptions.UniqueViolationError'>: {WITHHELD_MARKER}"
    )


def test_the_adapter_text_in_a_repr_is_cut_after_the_asyncpg_class() -> None:
    """A list's text holds its items' reprs. The adapter's text holds both kinds
    of quote, so its repr escapes the ones around the class."""
    text = repr([invalid_text_representation().orig])
    assert withhold_database_text(text) == (
        "[Error('<class \\'asyncpg.exceptions.InvalidTextRepresentationError\\'>: "
        f"{WITHHELD_MARKER}"
    )


def test_a_postgres_detail_line_is_cut() -> None:
    text = str(driver_error_of(unique_violation()))
    assert withhold_database_text(text) == (
        'duplicate key value violates unique constraint "probe_users_email_key"\n'
        f"DETAIL:  {WITHHELD_MARKER}"
    )


def test_a_sqlite_message_is_cut() -> None:
    assert withhold_database_text(str(sqlite_unique_violation())) == (
        f"(sqlite3.IntegrityError) {WITHHELD_MARKER}"
    )


def test_a_statement_error_wrapping_another_exception_is_cut() -> None:
    assert withhold_database_text(str(statement_error_from_value_error())) == (
        f"(builtins.ValueError) {WITHHELD_MARKER}"
    )


def test_an_error_repeating_a_failed_flush_is_cut_where_the_repeat_starts() -> None:
    assert withhold_database_text(str(sqlite_pending_rollback())) == (
        "This Session's transaction has been rolled back due to a previous "
        "exception during flush. To begin a new transaction with this Session, "
        "first issue Session.rollback(). Original exception was: "
        f"(sqlite3.IntegrityError) {WITHHELD_MARKER}"
    )


@pytest.mark.parametrize(
    "text",
    [
        "Saving the user failed",
        "Retrying (attempt 2) after a timeout",
        "(app.users.DuplicateEmail) that address is taken",
        "[SQL: SELECT 1]",
        "sqlalchemy.exc.IntegrityError [database message withheld] "
        "[SQL: SELECT users.id \nFROM users \nWHERE users.email = $1::VARCHAR]",
    ],
    ids=[
        "plain",
        "parenthesis",
        "module-like-prefix-without-sql",
        "sql-without-prefix",
        "multi-line-summary",
    ],
)
def test_text_without_database_text_is_unchanged(text: str) -> None:
    assert withhold_database_text(text) == text


@pytest.mark.parametrize(
    "make_error",
    [
        unique_violation,
        check_violation,
        bad_input,
        invalid_text_representation,
        sqlite_unique_violation,
        statement_error_from_value_error,
    ],
)
def test_a_summary_is_never_mistaken_for_database_text(
    make_error: Callable[[], BaseException],
) -> None:
    summary = summarize_database_error(make_error())
    assert withhold_database_text(summary) == summary
    assert withhold_database_text(repr(summary)) == repr(summary)


def test_applying_it_again_changes_nothing() -> None:
    once = withhold_database_text(f"Saving the user failed: {unique_violation()}")
    assert withhold_database_text(once) == once
