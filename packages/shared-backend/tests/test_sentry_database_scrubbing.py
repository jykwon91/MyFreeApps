"""The Sentry hooks: what ``init_sentry``'s SDK sends for a database error.

The value in the error (a fake email address) must appear nowhere in what is
sent, while the error's class, its driver error's class, the SQLSTATE, the
constraint and table names and the SQL statement must. A hook that raised
would drop its report silently, so the tests check what was sent, not only
what wasn't: a report that never left can't be checked for the value.
"""

from __future__ import annotations

import copy
import json
import uuid
from collections import ChainMap, UserDict, deque
from collections.abc import Callable, Mapping
from types import MappingProxyType

import pytest
import sentry_sdk
from sentry_sdk.types import Breadcrumb, Event
from sentry_sdk.utils import safe_repr
from sqlalchemy.exc import DBAPIError

from platform_shared.core.database_error_constants import WITHHELD_MARKER
from platform_shared.core.database_error_context import DatabaseErrorContext
from platform_shared.core.database_error_summary import summarize_database_error
from platform_shared.core.database_error_text_fallback import withhold_database_text
from platform_shared.core.logging_safety import install_crlf_safe_logging
from platform_shared.core.sentry_database_scrubbing import scrub_breadcrumb, scrub_event
from tests.database_error_reporting import (
    assert_probe_value_not_sent,
    report_every_way,
)
from tests.database_error_samples import (
    CAST_SQL,
    CHECK_CONSTRAINT,
    INSERT_OWNER_SQL,
    INSERT_SQL,
    PROBE_FRAGMENTS,
    PROBE_TABLE,
    PROBE_VALUE,
    PROBE_VALUE_WITH_APOSTROPHE,
    SQLITE_INSERT_SQL,
    UNIQUE_CONSTRAINT,
    bad_input,
    check_violation,
    driver_error_of,
    invalid_text_representation,
    sqlite_pending_rollback,
    sqlite_unique_violation,
    unique_violation,
)
from tests.import_outcome import ImportOutcome
from tests.probe_logger import probe_logger
from tests.sentry_capture import captured_sentry, sent_events, sent_logs

_SAMPLES = [
    unique_violation,
    check_violation,
    bad_input,
    invalid_text_representation,
    sqlite_unique_violation,
]

# What each sample's summary keeps.
_KEPT = [
    pytest.param(
        unique_violation,
        (
            "sqlalchemy.exc.IntegrityError",
            "cause=asyncpg.exceptions.UniqueViolationError",
            "sqlstate=23505",
            f"constraint={UNIQUE_CONSTRAINT}",
            f"table={PROBE_TABLE}",
            f"[SQL: {INSERT_SQL}]",
        ),
        id="unique-violation",
    ),
    pytest.param(
        check_violation,
        (
            "sqlalchemy.exc.IntegrityError",
            "cause=asyncpg.exceptions.CheckViolationError",
            "sqlstate=23514",
            f"constraint={CHECK_CONSTRAINT}",
            f"table={PROBE_TABLE}",
            f"[SQL: {INSERT_SQL}]",
        ),
        id="check-violation",
    ),
    pytest.param(
        bad_input,
        (
            "sqlalchemy.exc.DBAPIError",
            "cause=asyncpg.exceptions.DataError",
            "sqlstate=22000",
            f"[SQL: {INSERT_OWNER_SQL}]",
        ),
        id="bad-input",
    ),
    pytest.param(
        invalid_text_representation,
        (
            "sqlalchemy.exc.DBAPIError",
            "cause=asyncpg.exceptions.InvalidTextRepresentationError",
            "sqlstate=22P02",
            f"[SQL: {CAST_SQL}]",
        ),
        id="invalid-text-representation",
    ),
    pytest.param(
        sqlite_unique_violation,
        (
            "sqlalchemy.exc.IntegrityError",
            "cause=sqlite3.IntegrityError",
            "sqlite_error=SQLITE_CONSTRAINT_UNIQUE",
            f"[SQL: {SQLITE_INSERT_SQL}]",
        ),
        id="sqlite-unique-violation",
    ),
]


class _UnwritableError(Exception):
    """An exception whose ``str`` and ``repr`` both raise."""

    def __str__(self) -> str:
        raise RuntimeError("this error can't be written")

    def __repr__(self) -> str:
        raise RuntimeError("this error can't be written")


@pytest.mark.parametrize("make_error", _SAMPLES)
def test_no_report_of_a_database_error_carries_its_values(
    make_error: Callable[[], DBAPIError],
) -> None:
    assert_probe_value_not_sent(report_every_way(make_error()))


@pytest.mark.parametrize(("make_error", "kept"), _KEPT)
def test_every_exception_entry_is_a_summary_or_withheld(
    make_error: Callable[[], DBAPIError], kept: tuple[str, ...]
) -> None:
    error = make_error()
    events = sent_events(report_every_way(error))
    for event in events[:2]:  # capture_exception, then logger.exception
        entries = event["exception"]["values"]
        assert entries[-1]["value"] == summarize_database_error(error)
        for entry in entries:
            assert WITHHELD_MARKER in entry["value"]
    for text in kept:
        assert text in events[0]["exception"]["values"][-1]["value"]


@pytest.mark.parametrize("make_error", _SAMPLES)
def test_log_events_and_breadcrumbs_show_the_summary(
    make_error: Callable[[], DBAPIError],
) -> None:
    error = make_error()
    events = sent_events(report_every_way(error))
    summary = summarize_database_error(error)
    # No exception object left to work from (an f-string outside the except
    # block): the text fallback.
    withheld = withhold_database_text(str(error))

    log_events = events[1:7]
    assert [event["logentry"]["formatted"] for event in log_events] == [
        "Saving the user failed",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {withheld}",
    ]
    assert [event["logentry"]["params"] for event in log_events] == [
        [],
        [summary],
        [summary],
        [summary],
        [summary],
        [],
    ]

    crumbs = events[-1]["breadcrumbs"]["values"]
    assert [crumb["message"] for crumb in crumbs] == [
        "Saving the user failed",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {summary}",
        f"Retrying after: {summary}",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {withheld}",
    ]


def test_a_driver_error_with_a_newline_logged_through_the_crlf_filter_is_summarised() -> None:
    """The CRLF filter escapes only its handler's copy, so Sentry still finds the
    error among the record's arguments after the except block has ended. (A
    Sentry log of it isn't scrubbed: its hook gets no record, and a driver's
    message has no prefix for the text fallback to recognise.)"""
    driver_error = driver_error_of(invalid_text_representation(f"dana\n{PROBE_VALUE}"))
    assert "\n" in str(driver_error)
    with captured_sentry() as transport, probe_logger("app.probe_crlf") as logger:
        install_crlf_safe_logging(logger)
        logger.warning("Saving failed: %s", driver_error)
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    sent = json.dumps([log_event, message_event])
    assert [fragment for fragment in PROBE_FRAGMENTS if fragment in sent] == []
    written = f"Saving failed: {summarize_database_error(driver_error)}"
    assert log_event["logentry"]["formatted"] == written
    assert message_event["breadcrumbs"]["values"][0]["message"] == written


@pytest.mark.parametrize("make_error", _SAMPLES)
def test_sentry_logs_show_the_summary(make_error: Callable[[], DBAPIError]) -> None:
    error = make_error()
    logs = sent_logs(report_every_way(error))
    summary = summarize_database_error(error)
    withheld = withhold_database_text(str(error))
    # A log's hook gets no log record, only the exception being handled, so
    # once nothing is, the text fallback is all there is.
    assert [log["body"] for log in logs] == [
        "Saving the user failed",
        f"Saving the user failed: {summary}",
        f"Saving the user failed: {summary}",
        f"Retrying after: {summary}",
        f"Saving the user failed: {withheld}",
        f"Saving the user failed: {withheld}",
        f"Saving the user failed: {withheld}",
    ]


def test_an_error_repeating_a_failed_flush_goes_through_the_text_fallback() -> None:
    """PendingRollbackError isn't a database error and isn't chained to one, but
    its message repeats the failed flush's error, parameters and all."""
    error = sqlite_pending_rollback()
    with captured_sentry() as transport:
        sentry_sdk.capture_exception(error)
        sentry_sdk.flush()
    (event,) = sent_events(transport)
    assert_probe_value_not_sent(transport)
    assert event["exception"]["values"][-1]["value"] == withhold_database_text(
        str(error)
    )
    assert event["exception"]["values"][-1]["value"].endswith(
        f"Original exception was: (sqlite3.IntegrityError) {WITHHELD_MARKER}"
    )


@pytest.mark.parametrize(
    ("handled", "make_error"),
    [
        pytest.param(
            LookupError("invoice 42 has no property"),
            unique_violation,
            id="another-class",
        ),
        # asyncpg's codec raises a ValueError of its own, which is withheld.
        pytest.param(
            ValueError("invoice 42 has no property"),
            bad_input,
            id="the-class-of-a-withheld-error",
        ),
    ],
)
def test_the_error_being_handled_when_a_query_failed_keeps_its_own_text(
    handled: Exception, make_error: Callable[[], DBAPIError]
) -> None:
    """The app error whose handling ran the failing query is the driver error's
    ``__context__``. Sentry sends it as an entry of its own, and it's often
    what went wrong first."""
    try:
        raise handled
    except Exception:
        error = make_error()
    with captured_sentry() as transport:
        sentry_sdk.capture_exception(error)
        sentry_sdk.flush()
    (event,) = sent_events(transport)
    assert_probe_value_not_sent(transport)
    entries = event["exception"]["values"]
    assert (entries[0]["type"], entries[0]["value"]) == (
        type(handled).__name__,
        str(handled),
    )
    assert entries[-1]["value"] == summarize_database_error(error)


def test_an_exception_that_cannot_be_written_does_not_stop_the_report() -> None:
    """Sentry writes ``<broken repr>`` for it, and the context reads it the same way."""
    error = unique_violation()
    driver_error_of(error).__cause__ = _UnwritableError()
    with captured_sentry() as transport:
        sentry_sdk.capture_exception(error)
        sentry_sdk.flush()
    (event,) = sent_events(transport)
    assert_probe_value_not_sent(transport)
    entries = event["exception"]["values"]
    assert (entries[0]["type"], entries[0]["value"]) == (
        "_UnwritableError",
        WITHHELD_MARKER,
    )
    assert entries[-1]["value"] == summarize_database_error(error)


def test_an_extra_that_cannot_be_written_does_not_stop_the_scrubbing() -> None:
    error = unique_violation()
    attempt = _UnwritableError()
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        try:
            raise error
        except DBAPIError:
            logger.info(
                "Retrying after: %s",
                error,
                extra={"attempt": attempt, "error": error},
            )
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    (message_event,) = sent_events(transport)
    (log,) = sent_logs(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(error)
    (crumb,) = message_event["breadcrumbs"]["values"]
    assert crumb["message"] == f"Retrying after: {summary}"
    assert crumb["data"] == {"attempt": safe_repr(attempt), "error": summary}
    assert log["body"] == f"Retrying after: {summary}"


def test_a_breadcrumb_that_fails_to_scrub_is_dropped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sentry would keep a breadcrumb whose hook raised as it was."""

    def fail(_context: DatabaseErrorContext, _text: str) -> str:
        raise RuntimeError("scrubbing failed")

    monkeypatch.setattr(DatabaseErrorContext, "scrub_text", fail)
    crumb: Breadcrumb = {
        "type": "log",
        "message": f"Retrying after: {unique_violation()}",
    }
    assert scrub_breadcrumb(crumb, {}) is None


def test_log_arguments_given_as_a_mapping_are_replaced() -> None:
    error = check_violation()
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning(
            "Saving the %(kind)s address failed: %(error)s",
            {"kind": "work", "error": error},
        )
        sentry_sdk.flush()
    (event,) = sent_events(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(error)
    assert (
        event["logentry"]["formatted"] == f"Saving the work address failed: {summary}"
    )
    assert event["logentry"]["params"] == {"kind": "work", "error": summary}


def test_other_log_arguments_keep_the_form_sentry_gave_them() -> None:
    """The event was serialised before the hook ran and isn't again: putting the
    record's own UUID back would make the event impossible to send."""
    error = unique_violation()
    user_id = uuid.UUID(int=7)
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Saving user %s failed: %s", user_id, error)
        sentry_sdk.flush()
    (event,) = sent_events(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(error)
    assert event["logentry"]["params"] == [repr(user_id), summary]
    assert event["logentry"]["formatted"] == f"Saving user {user_id} failed: {summary}"


def test_an_exception_inside_a_log_argument_is_found() -> None:
    """A list's text holds each item's repr, so the message holds the driver's own
    text, which has nothing the text fallback could recognise.

    Only the events are checked: a Sentry log gets the arguments as text, and
    once no exception is being handled, the text fallback is all it has.
    """
    driver_error = driver_error_of(invalid_text_representation())
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Saving the users failed: %s", [driver_error])
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    sent = json.dumps([log_event, message_event])
    assert [fragment for fragment in PROBE_FRAGMENTS if fragment in sent] == []
    summary = summarize_database_error(driver_error)
    assert log_event["logentry"]["formatted"] == (
        f"Saving the users failed: [{summary}]"
    )
    assert log_event["logentry"]["params"] == [[summary]]
    assert message_event["breadcrumbs"]["values"][0]["message"] == (
        f"Saving the users failed: [{summary}]"
    )


def test_an_exception_nested_in_an_extra_is_found() -> None:
    driver_error = driver_error_of(invalid_text_representation())
    failures = {"first": [driver_error], "recent": deque([driver_error])}
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Saving the users failed", extra={"failures": failures})
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    (log,) = sent_logs(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(driver_error)
    # The event was written before the hook ran, and Sentry writes a deque
    # as its repr. A breadcrumb's data is still objects, and a deque in it
    # becomes a list.
    assert log_event["extra"] == {
        "failures": {"first": [summary], "recent": f"deque([{summary}])"}
    }
    assert message_event["breadcrumbs"]["values"][0]["data"] == {
        "failures": {"first": [summary], "recent": [summary]}
    }
    assert summary in str(log["attributes"]["failures"]["value"])
    assert failures == {"first": [driver_error], "recent": deque([driver_error])}


@pytest.mark.parametrize(
    "mapping",
    [
        pytest.param(MappingProxyType, id="mappingproxy"),
        pytest.param(ChainMap, id="chainmap"),
        pytest.param(UserDict, id="userdict"),
    ],
)
def test_an_exception_in_any_mapping_is_found(
    mapping: Callable[[dict[str, object]], Mapping[str, object]],
) -> None:
    """Sentry writes every mapping as a dict, not only a dict."""
    driver_error = driver_error_of(invalid_text_representation())
    failures = mapping({"first": driver_error})
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Saving the users failed", extra={"failures": failures})
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    (log,) = sent_logs(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(driver_error)
    assert log_event["extra"] == {"failures": {"first": summary}}
    assert message_event["breadcrumbs"]["values"][0]["data"] == {
        "failures": {"first": summary}
    }
    assert summary in str(log["attributes"]["failures"]["value"])
    assert failures["first"] is driver_error


def test_an_exception_in_a_dataclass_is_found() -> None:
    """Sentry writes a dataclass instance as its repr, which holds each field's repr."""
    driver_error = driver_error_of(invalid_text_representation())
    outcome = ImportOutcome(row=3, error=driver_error)
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Importing a row failed", extra={"outcome": outcome})
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    (log,) = sent_logs(transport)
    assert_probe_value_not_sent(transport)
    written = f"ImportOutcome(row=3, error={summarize_database_error(driver_error)})"
    assert log_event["extra"] == {"outcome": written}
    assert message_event["breadcrumbs"]["values"][0]["data"] == {"outcome": written}
    assert log["attributes"]["outcome"] == {"value": written, "type": "string"}
    assert outcome.error is driver_error


def test_an_error_text_written_by_repr_is_replaced() -> None:
    """``%r`` and a tuple's text write a string's ``repr``. The driver's text holds
    both kinds of quote and the value holds a ``'``, which ``repr`` escapes."""
    error = invalid_text_representation(PROBE_VALUE_WITH_APOSTROPHE)
    driver_error = driver_error_of(error)
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        try:
            raise error
        except DBAPIError:
            logger.warning("Saving failed: %r", str(driver_error))
            logger.warning("Saving failed: %s", driver_error.args)
        sentry_sdk.capture_message("after the failures")
        sentry_sdk.flush()
    first, second, message_event = sent_events(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(driver_error)
    written = [f"Saving failed: '{summary}'", f"Saving failed: ('{summary}',)"]
    assert [first["logentry"]["formatted"], second["logentry"]["formatted"]] == written
    assert [
        crumb["message"] for crumb in message_event["breadcrumbs"]["values"]
    ] == written
    assert [log["body"] for log in sent_logs(transport)] == written


def test_dict_keys_are_scrubbed_too() -> None:
    """Failures counted by message, or by the error itself: Sentry writes each key
    as ``str(key)``."""
    error = unique_violation()
    extra = {"by_message": {str(error): 2}, "by_error": {error: 1}}
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Saving the users failed", extra=extra)
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(error)
    expected = {"by_message": {summary: 2}, "by_error": {summary: 1}}
    assert log_event["extra"] == expected
    assert message_event["breadcrumbs"]["values"][0]["data"] == expected


def test_an_adapter_error_in_an_f_string_goes_through_the_text_fallback() -> None:
    """A list's text holds its items' reprs. The adapter's error text holds both
    kinds of quote, so its repr escapes the ones in ``<class 'asyncpg...'>: ``."""
    error = invalid_text_representation()
    message = f"Saving the users failed: {[error.orig]}"
    assert "<class \\'asyncpg.exceptions.InvalidTextRepresentationError\\'>: " in (
        message
    )
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning(message)
        sentry_sdk.flush()
    (event,) = sent_events(transport)
    (log,) = sent_logs(transport)
    assert_probe_value_not_sent(transport)
    assert event["logentry"]["formatted"] == withhold_database_text(message)
    assert log["body"] == withhold_database_text(message)
    assert log["body"].endswith(WITHHELD_MARKER)


def test_an_error_passed_as_extra_is_replaced_everywhere() -> None:
    error = unique_violation()
    with captured_sentry() as transport, probe_logger("app.probe") as logger:
        logger.warning("Saving the user failed", extra={"error": error})
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    log_event, message_event = sent_events(transport)
    (log,) = sent_logs(transport)
    assert_probe_value_not_sent(transport)
    summary = summarize_database_error(error)
    assert log_event["extra"] == {"error": summary}
    assert message_event["breadcrumbs"]["values"][0]["data"] == {"error": summary}
    assert log["attributes"]["error"] == {"value": summary, "type": "string"}


def test_a_breadcrumbs_data_is_copied_not_changed() -> None:
    """A breadcrumb's data holds the caller's own ``extra=`` objects."""
    error = unique_violation()
    attempts = [f"first try: {error}"]
    data = {"error": error, "attempts": attempts}
    crumb: Breadcrumb = {"type": "log", "message": "Retrying", "data": data}
    scrubbed = scrub_breadcrumb(crumb, {})
    assert scrubbed is not None
    summary = summarize_database_error(error)
    assert scrubbed["data"] == {"error": summary, "attempts": [f"first try: {summary}"]}
    assert data["error"] is error
    assert data["attempts"] is attempts
    assert attempts == [f"first try: {error}"]


def test_an_event_with_no_database_error_is_unchanged() -> None:
    event: Event = {
        "level": "error",
        "logentry": {
            "message": "Payment failed for order %s",
            "formatted": "Payment failed for order 42",
            "params": ["42"],
        },
        "exception": {
            "values": [{"type": "ValueError", "module": None, "value": "card declined"}]
        },
        "extra": {"order": "42"},
    }
    expected = copy.deepcopy(event)
    assert scrub_event(event, {}) == expected
