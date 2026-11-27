"""Tests for platform_shared.services.twilio_opt_out."""
from __future__ import annotations

import pytest

from platform_shared.core.sms_constants import TWILIO_START_KEYWORDS, TWILIO_STOP_KEYWORDS
from platform_shared.services.twilio_opt_out import classify_opt_out


@pytest.mark.parametrize("body", sorted(TWILIO_STOP_KEYWORDS))
def test_every_default_stop_keyword_is_stop(body: str) -> None:
    assert classify_opt_out(body, None) == "stop"


@pytest.mark.parametrize("body", sorted(TWILIO_START_KEYWORDS))
def test_every_default_start_keyword_is_start(body: str) -> None:
    assert classify_opt_out(body, None) == "start"


@pytest.mark.parametrize("body", ["stop", "Stop", "  STOP\n", "unstop"])
def test_case_and_surrounding_space_are_ignored(body: str) -> None:
    assert classify_opt_out(body, None) is not None


@pytest.mark.parametrize(
    "body",
    [
        "",
        "Please stop",
        "STOP!",
        "Stop texting me",
        "YES",  # a START keyword on long codes only; MyFreeApps texts from toll-free
        "HELP",  # Twilio answers HELP itself; one that does arrive is a message
        "Paid, thanks",
    ],
)
def test_anything_else_is_an_ordinary_message(body: str) -> None:
    assert classify_opt_out(body, None) is None


@pytest.mark.parametrize(
    ("opt_out_type", "expected"),
    [("STOP", "stop"), ("START", "start"), ("HELP", "help"), (" help ", "help")],
)
def test_twilios_opt_out_type_decides_when_present(opt_out_type: str, expected: str) -> None:
    assert classify_opt_out("whatever the text says", opt_out_type) == expected


def test_an_unknown_opt_out_type_is_not_guessed_from_the_text() -> None:
    assert classify_opt_out("STOP", "SOMETHING_NEW") is None
