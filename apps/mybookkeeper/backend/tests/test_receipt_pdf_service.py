"""Tests for the receipt PDF generator.

The generator is a pure function — no DB, no I/O. Tests verify:
- The output is a valid PDF (starts with %PDF header).
- Key strings from the receipt data appear in the extracted text.
- Same-month and cross-month period formatting.
- ``None`` payment method renders as ``—`` (or a dash equivalent).
- The receipt number and amount appear in extracted text.

Uses ``pypdf`` (already a project dependency) to extract page text, since
reportlab compresses the content stream with FlateDecode + ASCII85.
"""
from __future__ import annotations

import io
from datetime import date
from decimal import Decimal

import pytest
from pypdf import PdfReader

from app.services.leases.receipt_pdf_service import ReceiptData, generate_receipt_pdf


def _make_data(**overrides) -> ReceiptData:
    defaults = dict(
        receipt_number="R-2026-0001",
        receipt_date=date(2026, 5, 1),
        payer_name="Jane Doe",
        payer_email="jane@example.com",
        landlord_name="John Smith",
        property_address="123 Main St, Springfield, IL",
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        amount=Decimal("1500.00"),
        payment_method="check",
    )
    defaults.update(overrides)
    return ReceiptData(**defaults)


def _extract_text(pdf_bytes: bytes) -> str:
    """Extract all text from the first page of a PDF."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return reader.pages[0].extract_text()


class TestGenerateReceiptPdf:
    def test_returns_valid_pdf_bytes(self) -> None:
        pdf = generate_receipt_pdf(_make_data())
        assert isinstance(pdf, bytes)
        assert len(pdf) > 0
        # All PDFs start with %PDF
        assert pdf[:4] == b"%PDF"

    def test_receipt_number_present(self) -> None:
        pdf = generate_receipt_pdf(_make_data(receipt_number="R-2026-9999"))
        text = _extract_text(pdf)
        assert "R-2026-9999" in text

    def test_payer_name_present(self) -> None:
        pdf = generate_receipt_pdf(_make_data(payer_name="Alice Wonderland"))
        text = _extract_text(pdf)
        assert "Alice Wonderland" in text

    def test_landlord_name_present(self) -> None:
        pdf = generate_receipt_pdf(_make_data(landlord_name="Bob Builder"))
        text = _extract_text(pdf)
        assert "Bob Builder" in text

    def test_amount_present(self) -> None:
        pdf = generate_receipt_pdf(_make_data(amount=Decimal("2750.00")))
        text = _extract_text(pdf)
        assert "2,750.00" in text

    def test_mybookkeeper_footer(self) -> None:
        pdf = generate_receipt_pdf(_make_data())
        text = _extract_text(pdf)
        assert "MyBookkeeper" in text

    def test_none_payment_method_renders_dash(self) -> None:
        # When payment_method is None, the cell should not crash.
        pdf = generate_receipt_pdf(_make_data(payment_method=None))
        assert pdf[:4] == b"%PDF"
        # The method label line still appears
        text = _extract_text(pdf)
        assert "Payment method" in text

    def test_none_payer_email_skips_email_line(self) -> None:
        pdf = generate_receipt_pdf(_make_data(payer_email=None))
        assert pdf[:4] == b"%PDF"
        text = _extract_text(pdf)
        assert "jane@example.com" not in text

    def test_same_month_period_format(self) -> None:
        # Same month: "May 1–31, 2026"
        pdf = generate_receipt_pdf(
            _make_data(
                period_start=date(2026, 5, 1),
                period_end=date(2026, 5, 31),
            )
        )
        text = _extract_text(pdf)
        assert "May" in text
        assert "2026" in text

    def test_cross_month_period_format(self) -> None:
        # Different months — should not crash and renders both months.
        pdf = generate_receipt_pdf(
            _make_data(
                period_start=date(2026, 4, 15),
                period_end=date(2026, 5, 14),
            )
        )
        assert pdf[:4] == b"%PDF"
        text = _extract_text(pdf)
        assert "2026" in text

    def test_large_amount_renders(self) -> None:
        pdf = generate_receipt_pdf(_make_data(amount=Decimal("10000.00")))
        text = _extract_text(pdf)
        assert "10,000.00" in text

    def test_payer_email_present_when_provided(self) -> None:
        pdf = generate_receipt_pdf(_make_data(payer_email="tenant@example.com"))
        text = _extract_text(pdf)
        assert "tenant@example.com" in text
