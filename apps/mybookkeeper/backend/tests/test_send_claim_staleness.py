"""The shared check for when a Gmail send claim may be settled."""
from __future__ import annotations

import datetime as _dt

from app.services.email.constants import GMAIL_SEND_CLAIM_STALE_AFTER
from app.services.email.send_claim_staleness import is_send_claim_stale

NOW = _dt.datetime(2026, 11, 5, 12, 0, tzinfo=_dt.timezone.utc)


def test_fresh_claim_is_not_stale() -> None:
    assert not is_send_claim_stale(NOW - GMAIL_SEND_CLAIM_STALE_AFTER + _dt.timedelta(seconds=1), NOW)


def test_claim_is_stale_from_the_threshold_on() -> None:
    assert is_send_claim_stale(NOW - GMAIL_SEND_CLAIM_STALE_AFTER, NOW)


def test_naive_timestamps_are_read_as_utc() -> None:
    naive = (NOW - GMAIL_SEND_CLAIM_STALE_AFTER).replace(tzinfo=None)
    assert is_send_claim_stale(naive, NOW)
    assert not is_send_claim_stale(NOW.replace(tzinfo=None), NOW)
