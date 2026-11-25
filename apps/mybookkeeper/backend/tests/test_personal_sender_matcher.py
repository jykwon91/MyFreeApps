"""Which payments a remembered personal-transfer sender matches.

Every combination of the (name, handle) key: same sender with and without a
handle on either side, the same name with a different handle (a different
person), a different name with the same handle, and nameless payments.
"""
import uuid

import pytest

from app.core.personal_sender_keys import normalize_sender_handle, normalize_sender_name
from app.models.transactions.personal_transfer_sender import PersonalTransferSender
from app.services.transactions.personal_sender_matcher import (
    find_matching_sender,
    handles_compatible,
    sender_matches,
)


def _sender(name: str = "dao nguyen", handle: str = "") -> PersonalTransferSender:
    return PersonalTransferSender(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), display_name=name,
        normalized_payer_name=name, payer_handle=handle,
    )


def test_name_is_lowercased_and_whitespace_collapsed() -> None:
    assert normalize_sender_name("  DAO   Nguyen\t") == "dao nguyen"
    assert normalize_sender_name(None) == ""
    assert normalize_sender_name("   ") == ""


def test_handle_is_lowercased_and_trimmed() -> None:
    assert normalize_sender_handle(" Dao@Example.com ") == "dao@example.com"
    assert normalize_sender_handle(None) == ""


@pytest.mark.parametrize(
    ("stored", "incoming", "expected"),
    [
        ("", "", True),
        ("", "dao@example.com", True),
        ("dao@example.com", "", True),
        ("dao@example.com", "dao@example.com", True),
        ("dao@example.com", "other@example.com", False),
    ],
)
def test_handles_compatible(stored: str, incoming: str, expected: bool) -> None:
    assert handles_compatible(stored, incoming) is expected


def test_same_name_differently_spelled_matches() -> None:
    assert sender_matches(_sender(), payer_name="DAO  NGUYEN", payer_handle=None)


def test_same_name_different_handle_is_a_different_person() -> None:
    sender = _sender(handle="dao@example.com")
    assert not sender_matches(sender, payer_name="Dao Nguyen", payer_handle="someone@example.com")


def test_different_name_same_handle_does_not_match() -> None:
    sender = _sender(handle="dao@example.com")
    assert not sender_matches(sender, payer_name="Kim Tran", payer_handle="dao@example.com")


def test_nameless_payment_never_matches() -> None:
    assert not sender_matches(_sender(), payer_name=None, payer_handle="dao@example.com")
    assert not sender_matches(_sender(), payer_name="  ", payer_handle=None)


def test_any_compatible_row_matches_whatever_the_order() -> None:
    with_handle = _sender(handle="dao@example.com")
    without = _sender()
    for senders in ([with_handle, without], [without, with_handle]):
        assert find_matching_sender(senders, payer_name="Dao Nguyen", payer_handle="new@example.com") is without


def test_no_compatible_row_is_no_match() -> None:
    senders = [_sender(handle="dao@example.com")]
    assert find_matching_sender(senders, payer_name="Dao Nguyen", payer_handle="new@example.com") is None
    assert find_matching_sender([], payer_name="Dao Nguyen", payer_handle=None) is None
