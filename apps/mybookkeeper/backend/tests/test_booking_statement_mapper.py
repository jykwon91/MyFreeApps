"""Tests for booking_statement_mapper — building BookingStatement models from line items."""
import uuid

import pytest
from decimal import Decimal

from app.mappers.booking_statement_mapper import (
    build_booking_statement_from_line_item,
    build_booking_statements_from_line_items,
)

ORG_ID = uuid.uuid4()


class TestBuildBookingStatementFromLineItem:
    def test_basic_booking_statement(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "platform": "airbnb",
            "gross_booking": "500.00",
        }
        bs = build_booking_statement_from_line_item(li, ORG_ID)
        assert bs is not None
        assert bs.res_code == "ABC123"
        assert bs.platform == "airbnb"
        assert bs.gross_booking == Decimal("500.00")

    def test_missing_res_code_returns_none(self) -> None:
        li = {"check_in": "2025-01-01", "check_out": "2025-01-05"}
        assert build_booking_statement_from_line_item(li, ORG_ID) is None

    def test_missing_dates_returns_none(self) -> None:
        li = {"res_code": "ABC123"}
        assert build_booking_statement_from_line_item(li, ORG_ID) is None

    def test_checkout_before_checkin_returns_none(self) -> None:
        li = {"res_code": "ABC123", "check_in": "2025-01-05", "check_out": "2025-01-01"}
        assert build_booking_statement_from_line_item(li, ORG_ID) is None

    def test_gross_booking_computed_from_net_plus_commission(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "net_booking_revenue": "400.00",
            "commission": "100.00",
        }
        bs = build_booking_statement_from_line_item(li, ORG_ID)
        assert bs is not None
        assert bs.gross_booking == Decimal("500.00")

    def test_platform_cleared_when_gross_booking_null(self) -> None:
        """DB constraint: platform IS NULL OR gross_booking IS NOT NULL.

        When gross_booking can't be determined, platform must be cleared.
        """
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "platform": "airbnb",
            # No gross_booking, booking_revenue, or net_booking_revenue
        }
        bs = build_booking_statement_from_line_item(li, ORG_ID)
        assert bs is not None
        assert bs.platform is None
        assert bs.gross_booking is None

    def test_platform_kept_when_gross_booking_present(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "platform": "vrbo",
            "gross_booking": "300.00",
        }
        bs = build_booking_statement_from_line_item(li, ORG_ID)
        assert bs is not None
        assert bs.platform == "vrbo"
        assert bs.gross_booking == Decimal("300.00")

    def test_no_platform_no_gross_is_fine(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
        }
        bs = build_booking_statement_from_line_item(li, ORG_ID)
        assert bs is not None
        assert bs.platform is None
        assert bs.gross_booking is None


class TestBuildBookingStatementsFromLineItems:
    def test_empty_list(self) -> None:
        assert build_booking_statements_from_line_items([], ORG_ID) == []

    def test_none_input(self) -> None:
        assert build_booking_statements_from_line_items(None, ORG_ID) == []

    def test_skips_invalid_items(self) -> None:
        items = [
            {"res_code": "A", "check_in": "2025-01-01", "check_out": "2025-01-05", "gross_booking": "100"},
            {"bad": "data"},
            "not a dict",
        ]
        result = build_booking_statements_from_line_items(items, ORG_ID)
        assert len(result) == 1
        assert result[0].res_code == "A"
