"""Tests for rent_receipt_sequence_repo.

Covers:
- format_receipt_number produces the expected string format (pure function, no DB).

Note: next_number uses a raw PostgreSQL INSERT ... ON CONFLICT DO UPDATE ... RETURNING
which is not supported by the SQLite test fixture. The atomicity and increment
behaviour is covered by E2E tests that run against a real PostgreSQL database.
"""
from __future__ import annotations

from app.repositories.leases import rent_receipt_sequence_repo


class TestFormatReceiptNumber:
    def test_pads_to_four_digits(self) -> None:
        assert rent_receipt_sequence_repo.format_receipt_number(2026, 1) == "R-2026-0001"

    def test_handles_large_number(self) -> None:
        assert rent_receipt_sequence_repo.format_receipt_number(2026, 9999) == "R-2026-9999"

    def test_different_year(self) -> None:
        assert rent_receipt_sequence_repo.format_receipt_number(2027, 42) == "R-2027-0042"

    def test_max_padding_ten_thousand(self) -> None:
        # Numbers >9999 still render correctly (no zero-padding).
        assert rent_receipt_sequence_repo.format_receipt_number(2026, 10000) == "R-2026-10000"
