"""The request id a reminder text carries names the send row and the try."""
import uuid

import pytest

from app.core.rent_reminder_request_id import (
    format_reminder_request_id,
    parse_reminder_request_id,
)

SEND_ID = uuid.UUID("3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c")


def test_round_trips() -> None:
    assert parse_reminder_request_id(format_reminder_request_id(SEND_ID, 3)) == (SEND_ID, 3)


def test_an_id_sent_before_tries_were_numbered_is_try_one() -> None:
    assert parse_reminder_request_id(str(SEND_ID)) == (SEND_ID, 1)


@pytest.mark.parametrize(
    "value",
    [
        None, "", "not-a-uuid", f"{SEND_ID}:", f"{SEND_ID}:0", f"{SEND_ID}:x", f"{SEND_ID}:-1",
        f"{SEND_ID}:\u00b2", f"{SEND_ID}:\u0663", f"{SEND_ID}:01", f"{SEND_ID}: 2", f"{SEND_ID}:2\n",
    ],
    ids=["none", "empty", "not_uuid", "no_try", "zero", "letter", "negative",
         "superscript_two", "arabic_indic_three", "leading_zero", "space", "newline"],
)
def test_anything_else_is_not_ours(value: str | None) -> None:
    assert parse_reminder_request_id(value) is None
