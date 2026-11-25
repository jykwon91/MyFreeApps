"""Who sent an incoming bank payment, read from its description (pure)."""
from __future__ import annotations

import pytest

from app.services.transactions.bank_payer_name_parser import parse_payer_name


@pytest.mark.parametrize(
    ("description", "expected"),
    [
        # Chase Zelle: shouted name, reference digits last.
        ("Zelle payment from SONU KING 31731713019", "Sonu King"),
        ("Zelle payment from SONU KING BAC0aj2k9x1", "Sonu King"),
        ("ZELLE PAYMENT FROM MARY-JANE O'NEIL 12345", "Mary-jane O'neil"),
        ("Zelle Transfer from Sonu King", "Sonu King"),
        # Zelle alert shape: memo after a dash, colon or "for".
        ("Zelle from Sonu King — memo: rent", "Sonu King"),
        ("Zelle from Sonu King - rent", "Sonu King"),
        ("Zelle from Sonu King for November rent", "Sonu King"),
        ("Zelle from Sonu King; Conf# 991", "Sonu King"),
        # Mixed case is kept as written.
        ("Zelle from Ian McDonald", "Ian McDonald"),
        # Wise: full name then brackets, empty or not.
        ("Nicole Santos Felix ()", "Nicole Santos Felix"),
        ("Nicole Santos Felix (rent nov)", "Nicole Santos Felix"),
        ("NICOLE SANTOS FELIX ()", "Nicole Santos Felix"),
    ],
)
def test_reads_the_sender(description: str, expected: str) -> None:
    assert parse_payer_name(description) == expected


@pytest.mark.parametrize(
    "description",
    [
        None,
        "",
        "Corner Store",
        "Payroll ACME CORP",
        "Zelle payment from 31731713019",
        "Zelle from",
        # Bracketed bank wording is not a person.
        "Interest Payment (Savings)",
        "Wise Deposit ()",
        "ACH Credit (Online)",
        # One word in brackets is not a full name.
        "Refund ()",
        # Digits in the name part of a bracketed description.
        "Store 123 ()",
        # Too many words to be a name.
        "One Two Three Four Five Six ()",
    ],
)
def test_reads_nothing_from_rows_that_are_not_a_person_paying(description: str | None) -> None:
    assert parse_payer_name(description) is None
