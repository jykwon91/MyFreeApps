"""DatabaseErrorContext: which exceptions are withheld, and what is sent instead."""

from __future__ import annotations

import asyncpg
import pytest

from platform_shared.core.database_error_constants import WITHHELD_MARKER
from platform_shared.core.database_error_context import DatabaseErrorContext
from platform_shared.core.database_error_summary import summarize_database_error
from tests.database_error_samples import (
    PROBE_VALUE,
    PROBE_VALUE_WITH_APOSTROPHE,
    bad_input,
    check_violation,
    driver_error_of,
    invalid_text_representation,
    sqlite_unique_violation,
    unique_violation,
)


class _EmailTakenError(Exception):
    """An app's own error, raised from a database error."""


def test_each_database_error_in_the_chain_is_replaced_by_its_summary() -> None:
    wrapped = unique_violation()
    adapter_error = wrapped.orig
    assert adapter_error is not None
    driver_error = driver_error_of(wrapped)
    context = DatabaseErrorContext([wrapped])
    for error in (wrapped, adapter_error, driver_error):
        assert context.replacement_for(error) == summarize_database_error(error)


def test_an_error_beneath_a_database_error_is_withheld() -> None:
    """asyncpg raises its DataError from the codec's ValueError, which holds the value."""
    wrapped = bad_input()
    codec_error = driver_error_of(wrapped).__cause__
    assert isinstance(codec_error, ValueError)
    assert PROBE_VALUE in str(codec_error)
    assert (
        DatabaseErrorContext([wrapped]).replacement_for(codec_error) == WITHHELD_MARKER
    )


def test_the_error_being_handled_when_a_query_failed_keeps_its_own_text() -> None:
    """The app error whose handling ran the failing query is the driver error's
    ``__context__``, not an error the driver raised it from."""
    lookup_error = LookupError("invoice 42 has no property")
    try:
        raise lookup_error
    except LookupError:
        wrapped = unique_violation()
    assert driver_error_of(wrapped).__context__ is lookup_error
    context = DatabaseErrorContext([wrapped])
    assert context.replacement_for(lookup_error) is None
    assert context.replacement_for(wrapped) == summarize_database_error(wrapped)


def test_an_entry_of_the_class_of_a_withheld_error_keeps_the_app_text() -> None:
    """The app was handling its own ``ValueError`` when asyncpg's codec raised a
    ``ValueError`` holding the value. Sentry sends both as ``ValueError`` entries."""
    handled = ValueError("invoice 42 has no property")
    try:
        raise handled
    except ValueError:
        wrapped = bad_input()
    codec_error = driver_error_of(wrapped).__cause__
    assert isinstance(codec_error, ValueError)
    context = DatabaseErrorContext([wrapped])
    assert context.replacement_for(handled) is None
    assert context.replacement_for_exception_value(None, "ValueError", str(handled)) is None
    for value in (str(codec_error), f"{codec_error}\na note", "neither text"):
        assert (
            context.replacement_for_exception_value(None, "ValueError", value)
            == WITHHELD_MARKER
        )


def test_an_error_reached_both_ways_is_withheld() -> None:
    """One driver error's ``__context__`` and another's ``__cause__``: reaching it
    the first way doesn't stop the second from withholding it."""
    holder = ValueError(f"invalid input for query argument $1: {PROBE_VALUE!r}")
    handled_first = unique_violation()
    driver_error_of(handled_first).__context__ = holder
    raised_from = invalid_text_representation()
    driver_error_of(raised_from).__cause__ = holder
    context = DatabaseErrorContext([handled_first, raised_from])
    assert context.replacement_for(holder) == WITHHELD_MARKER


def test_an_app_error_raised_from_a_database_error_keeps_its_own_text() -> None:
    wrapped = unique_violation()
    app_error = _EmailTakenError(f"Could not save the user: {wrapped}")
    app_error.__cause__ = wrapped  # what ``raise ... from wrapped`` sets
    context = DatabaseErrorContext([app_error])
    assert context.replacement_for(app_error) is None
    assert context.replacement_for(wrapped) == summarize_database_error(wrapped)
    assert context.scrub_text(str(app_error)) == (
        f"Could not save the user: {summarize_database_error(wrapped)}"
    )


def test_the_members_of_an_exception_group_are_looked_at() -> None:
    wrapped = check_violation()
    app_error = ValueError("row 3 has no name")
    group = ExceptionGroup("the import failed", [app_error, wrapped])
    context = DatabaseErrorContext([group])
    assert context.replacement_for(group) is None
    assert context.replacement_for(app_error) is None
    assert context.replacement_for(wrapped) == summarize_database_error(wrapped)


def test_text_written_by_repr_is_replaced_however_repr_quotes_it() -> None:
    """``repr`` escapes each ``'`` when it quotes with ``'``, which it does unless the
    string holds a ``'`` and no ``"``. The string may be the text itself or a
    longer one holding it (``%r``, or a list's text)."""
    with_both_quotes = invalid_text_representation(PROBE_VALUE_WITH_APOSTROPHE)
    driver_error = driver_error_of(with_both_quotes)
    with_apostrophes = bad_input()
    codec_error = driver_error_of(with_apostrophes).__cause__
    assert codec_error is not None
    context = DatabaseErrorContext([with_both_quotes, with_apostrophes])
    summary = summarize_database_error(driver_error)
    assert context.scrub_text(repr(str(driver_error))) == f"'{summary}'"
    assert context.scrub_text(repr(f'"{codec_error}"')) == repr(f'"{WITHHELD_MARKER}"')


def test_a_driver_field_logged_alone_is_replaced() -> None:
    """asyncpg keeps the DETAIL line as ``detail``: a caller may log just that."""
    wrapped = unique_violation()
    driver_error = driver_error_of(wrapped)
    assert isinstance(driver_error, asyncpg.exceptions.PostgresError)
    assert PROBE_VALUE in driver_error.detail
    context = DatabaseErrorContext([wrapped])
    assert context.scrub_text(f"duplicate: {driver_error.detail}") == (
        f"duplicate: {summarize_database_error(driver_error)}"
    )


def test_database_text_with_no_exception_behind_it_goes_to_the_text_fallback() -> None:
    other = sqlite_unique_violation()
    context = DatabaseErrorContext([unique_violation()])
    assert context.scrub_text(f"Earlier: {other}") == (
        f"Earlier: (sqlite3.IntegrityError) {WITHHELD_MARKER}"
    )


def test_an_exception_entry_is_matched_to_the_error_whose_text_it_holds() -> None:
    """Two withheld errors of one class: each Sentry entry gets its own summary."""
    first = unique_violation()
    second = check_violation()
    context = DatabaseErrorContext([first, second])
    module, type_name = "sqlalchemy.exc", "IntegrityError"
    assert context.replacement_for_exception_value(module, type_name, str(first)) == (
        summarize_database_error(first)
    )
    assert context.replacement_for_exception_value(module, type_name, str(second)) == (
        summarize_database_error(second)
    )
    # Sentry appends an exception's notes after a newline.
    assert context.replacement_for_exception_value(
        module, type_name, f"{second}\nwhile importing row 3"
    ) == summarize_database_error(second)
    # Text that matches neither still gets a value-free summary.
    assert context.replacement_for_exception_value(module, type_name, "truncated") == (
        summarize_database_error(first)
    )


def test_a_builtin_exception_entry_is_matched_without_a_module() -> None:
    """Sentry sends ``module: null`` for a builtin class like the codec's ValueError."""
    context = DatabaseErrorContext([bad_input()])
    assert context.replacement_for_exception_value(None, "ValueError", "anything") == (
        WITHHELD_MARKER
    )
    assert (
        context.replacement_for_exception_value("builtins", "ValueError", "x") is None
    )


def test_an_exception_entry_of_another_class_is_left_alone() -> None:
    context = DatabaseErrorContext([unique_violation()])
    assert (
        context.replacement_for_exception_value("app.errors", "EmailTaken", "x") is None
    )


def test_errors_unrelated_to_the_database_are_left_alone() -> None:
    error = ValueError(f"no account for {PROBE_VALUE}")
    context = DatabaseErrorContext([error])
    assert context.replacement_for(error) is None
    assert context.scrub_text(str(error)) == str(error)


@pytest.mark.parametrize("value", ["a string", 42, None], ids=["str", "int", "none"])
def test_only_exceptions_have_replacements(value: object) -> None:
    assert DatabaseErrorContext([unique_violation()]).replacement_for(value) is None


def test_short_texts_are_not_searched_for() -> None:
    """A text under MIN_KNOWN_TEXT_LENGTH would match unrelated words."""
    short_error_class = type(
        "Error", (Exception,), {"__module__": "asyncpg.exceptions"}
    )
    error = short_error_class("closed")
    context = DatabaseErrorContext([error])
    assert context.replacement_for(error) == (
        f"asyncpg.exceptions.Error {WITHHELD_MARKER}"
    )
    assert context.scrub_text("the dialog was closed") == "the dialog was closed"


def test_a_cycle_in_the_chain_ends() -> None:
    wrapped = unique_violation()
    driver_error = driver_error_of(wrapped)
    driver_error.__cause__ = wrapped
    driver_error.__context__ = wrapped
    context = DatabaseErrorContext([wrapped])
    assert context.replacement_for(wrapped) == summarize_database_error(wrapped)
    assert context.replacement_for(driver_error) == summarize_database_error(
        driver_error
    )
