"""The amount typed in from a 1099 is checked the same way the column stores it."""
from decimal import Decimal

import pytest
from app.schemas.transactions.reconciliation import Upload1099Request
from pydantic import ValidationError


def _request(amount: object) -> Upload1099Request:
    return Upload1099Request(source_type="1099_k", tax_year=2025, reported_amount=amount)


@pytest.mark.parametrize("amount", ["0", "0.00", "84.2", "1234.56", "9999999999.99", 100])
def test_accepts_what_the_column_holds(amount: object) -> None:
    assert _request(amount).reported_amount == Decimal(str(amount))


def test_whole_cents_written_with_extra_zeros_are_fine() -> None:
    assert _request("100.000").reported_amount == Decimal(100)


@pytest.mark.parametrize("amount, message", [
    ("-0.01", "Enter an amount of $0 or more."),
    ("-500", "Enter an amount of $0 or more."),
    ("12.345", "Use dollars and cents, like 84.20."),
    ("10000000000", "That amount is too large."),
    ("99999999999999.99", "That amount is too large."),
    ("NaN", "finite"),
    ("Infinity", "finite"),
])
def test_refuses_what_the_column_would_refuse_or_change(amount: str, message: str) -> None:
    with pytest.raises(ValidationError) as exc:
        _request(amount)
    assert message in str(exc.value)
