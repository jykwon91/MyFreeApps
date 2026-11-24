"""The website and phone describe every reminder failure code the server records.

The codes are decided on the server (``app/core/rent_reminder_constants.py``);
the api-client repeats the words for each one, the prefixes of the codes that
carry their own detail, the "may still arrive" set it warns about, and the code
Send now refuses a possible duplicate with.
"""
import re
from pathlib import Path

import pytest

from app.core.rent_reminder_constants import (
    MAY_STILL_ARRIVE_ERRORS,
    PHONE_FAILED_CODE_PREFIX,
    REMINDER_ERROR_CODES,
    REMINDER_MAY_HAVE_BEEN_SENT_CODE,
    SMS_RELAY_CODE_PREFIX,
)

API_CLIENT = Path(__file__).parents[2] / "api-client" / "src"


def _between(source: str, start: str, end: str, *, file: str) -> str:
    """The text between two markers, or a clear failure if the file moved on."""
    _, found, after = source.partition(start)
    body, closed, _ = after.partition(end)
    assert found and closed, (
        f"{file} no longer has {start!r} ... {end!r}; update this test's parser "
        "to the new shape so the codes are still compared."
    )
    return body


def _error_words_file() -> str:
    return (API_CLIENT / "utils" / "rentReminderError.ts").read_text(encoding="utf-8")


def _labelled_codes() -> set[str]:
    labels = _between(_error_words_file(), "Object.entries({", "}));", file="rentReminderError.ts")
    return set(re.findall(r"^\s{2}(\w+):", labels, flags=re.MULTILINE))


def _codes_file() -> str:
    return (API_CLIENT / "constants" / "rentReminderErrorCodes.ts").read_text(encoding="utf-8")


def test_every_reminder_error_code_has_words() -> None:
    assert REMINDER_ERROR_CODES <= _labelled_codes()


def test_no_words_for_a_code_the_server_never_records() -> None:
    assert _labelled_codes() <= REMINDER_ERROR_CODES


@pytest.mark.parametrize(
    ("name", "prefix"),
    [("PHONE_FAILED_PREFIX", PHONE_FAILED_CODE_PREFIX), ("RELAY_PREFIX", SMS_RELAY_CODE_PREFIX)],
)
def test_prefixed_codes_are_spelled_the_same(name: str, prefix: str) -> None:
    literal = _between(_error_words_file(), f"const {name} =", ";", file="rentReminderError.ts")
    assert re.findall(r'"([^"]*)"', literal) == [prefix]


def test_may_still_arrive_codes_match() -> None:
    literal = _between(
        _codes_file(), "MAY_STILL_ARRIVE_ERROR_CODES", "];", file="rentReminderErrorCodes.ts",
    )
    assert set(re.findall(r'"([^"]+)"', literal)) == MAY_STILL_ARRIVE_ERRORS


def test_may_have_been_sent_code_matches() -> None:
    literal = _between(
        _codes_file(),
        "export const REMINDER_MAY_HAVE_BEEN_SENT_CODE =",
        ";",
        file="rentReminderErrorCodes.ts",
    )
    assert re.findall(r'"([^"]+)"', literal) == [REMINDER_MAY_HAVE_BEEN_SENT_CODE]


def test_a_moved_file_shape_fails_with_a_clear_message() -> None:
    try:
        _between("nothing here", "Object.entries({", "}));", file="x.ts")
    except AssertionError as exc:
        assert "update this test's parser" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected a clear failure")
