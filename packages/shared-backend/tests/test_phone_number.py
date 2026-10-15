"""Tests for platform_shared.services.phone_number.to_e164."""
from __future__ import annotations

import pytest

from platform_shared.services.phone_number import to_e164


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("(713) 555-0100", "+17135550100"),
        ("713.555.0100", "+17135550100"),
        ("1-713-555-0100", "+17135550100"),
        ("+1 713 555 0100", "+17135550100"),
        ("+44 20 7946 0958", "+442079460958"),
    ],
)
def test_normalizes(raw: str, expected: str) -> None:
    assert to_e164(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "   ", "555-0100", "2-713-555-0100", "+123"])
def test_rejects_unreadable(raw: str | None) -> None:
    assert to_e164(raw) is None
