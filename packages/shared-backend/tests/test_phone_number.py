"""Tests for platform_shared.services.phone_number."""
from __future__ import annotations

import pytest

from platform_shared.services.phone_number import parse_e164, to_e164


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


@pytest.mark.parametrize("value", ["+17135550100", "+442079460958", "+12345678", "+123456789012345"])
def test_parse_e164_accepts_exact_e164(value: str) -> None:
    assert parse_e164(value) == value


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "7135550100",
        "+1 713 555 0100",
        "(713) 555-0100",
        "whatsapp:+17135550100",
        "+17135550100 ",
        "+07135550100",
        "+1234567",
        "+1234567890123456",
        "+1713555010\uff10",  # ends in a fullwidth 0
        "+1713555010\u0663",  # ends in an Arabic-Indic 3
    ],
)
def test_parse_e164_refuses_anything_else(value: str | None) -> None:
    assert parse_e164(value) is None
