"""Which stuck receipts went through a Gmail account that isn't connected any more."""
from __future__ import annotations

import datetime as _dt

import pytest

from app.models.integrations.integration import Integration
from app.services.email.constants import GMAIL_SEND_CLAIM_STALE_AFTER
from app.services.leases.receipt_other_gmail import sent_from_other_gmail

NOW = _dt.datetime(2026, 11, 6, 12, tzinfo=_dt.timezone.utc)
STALE = NOW - GMAIL_SEND_CLAIM_STALE_AFTER
RECENT = NOW - GMAIL_SEND_CLAIM_STALE_AFTER + _dt.timedelta(seconds=1)


def _connected(address: str | None) -> Integration:
    return Integration(provider="gmail", gmail_address=address)


def _check(**overrides: object) -> str | None:
    values: dict[str, object] = {
        "status": "sending",
        "sender_gmail_address": "old@gmail.com",
        "send_message_id": "<id@mybookkeeper>",
        "send_claimed_at": STALE,
        "integration": _connected("new@gmail.com"),
        "now": NOW,
    }
    values.update(overrides)
    return sent_from_other_gmail(**values)  # type: ignore[arg-type]


def test_names_the_account_when_another_is_connected() -> None:
    assert _check() == "old@gmail.com"


def test_names_the_account_when_gmail_is_disconnected() -> None:
    assert _check(integration=None) == "old@gmail.com"


def test_naive_claim_time_is_read_as_utc() -> None:
    assert _check(send_claimed_at=STALE.replace(tzinfo=None)) == "old@gmail.com"


@pytest.mark.parametrize(
    "overrides",
    [
        {"status": "pending"},
        {"sender_gmail_address": None},
        {"send_message_id": None},
        {"send_claimed_at": None},
        {"send_claimed_at": RECENT},
        {"integration": _connected(None)},
        {"integration": _connected(" OLD@gmail.com ")},
    ],
    ids=["not-sending", "legacy-claim", "no-message-id", "no-claim-time", "still-running",
         "connection-address-unknown", "same-account"],
)
def test_names_nothing_when_sending_can_settle_it(overrides: dict[str, object]) -> None:
    assert _check(**overrides) is None
