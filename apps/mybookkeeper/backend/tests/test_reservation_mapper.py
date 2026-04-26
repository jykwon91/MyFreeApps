"""Tests for reservation_mapper — building Reservation models from line items."""
import uuid

import pytest
from decimal import Decimal

from app.mappers.reservation_mapper import (
    build_reservation_from_line_item,
    build_reservations_from_line_items,
)

ORG_ID = uuid.uuid4()


class TestBuildReservationFromLineItem:
    def test_basic_reservation(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "platform": "airbnb",
            "gross_booking": "500.00",
        }
        res = build_reservation_from_line_item(li, ORG_ID)
        assert res is not None
        assert res.res_code == "ABC123"
        assert res.platform == "airbnb"
        assert res.gross_booking == Decimal("500.00")

    def test_missing_res_code_returns_none(self) -> None:
        li = {"check_in": "2025-01-01", "check_out": "2025-01-05"}
        assert build_reservation_from_line_item(li, ORG_ID) is None

    def test_missing_dates_returns_none(self) -> None:
        li = {"res_code": "ABC123"}
        assert build_reservation_from_line_item(li, ORG_ID) is None

    def test_checkout_before_checkin_returns_none(self) -> None:
        li = {"res_code": "ABC123", "check_in": "2025-01-05", "check_out": "2025-01-01"}
        assert build_reservation_from_line_item(li, ORG_ID) is None

    def test_gross_booking_computed_from_net_plus_commission(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "net_booking_revenue": "400.00",
            "commission": "100.00",
        }
        res = build_reservation_from_line_item(li, ORG_ID)
        assert res is not None
        assert res.gross_booking == Decimal("500.00")

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
        res = build_reservation_from_line_item(li, ORG_ID)
        assert res is not None
        assert res.platform is None
        assert res.gross_booking is None

    def test_platform_kept_when_gross_booking_present(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
            "platform": "vrbo",
            "gross_booking": "300.00",
        }
        res = build_reservation_from_line_item(li, ORG_ID)
        assert res is not None
        assert res.platform == "vrbo"
        assert res.gross_booking == Decimal("300.00")

    def test_no_platform_no_gross_is_fine(self) -> None:
        li = {
            "res_code": "ABC123",
            "check_in": "2025-01-01",
            "check_out": "2025-01-05",
        }
        res = build_reservation_from_line_item(li, ORG_ID)
        assert res is not None
        assert res.platform is None
        assert res.gross_booking is None


class TestBuildReservationsFromLineItems:
    def test_empty_list(self) -> None:
        assert build_reservations_from_line_items([], ORG_ID) == []

    def test_none_input(self) -> None:
        assert build_reservations_from_line_items(None, ORG_ID) == []

    def test_skips_invalid_items(self) -> None:
        items = [
            {"res_code": "A", "check_in": "2025-01-01", "check_out": "2025-01-05", "gross_booking": "100"},
            {"bad": "data"},
            "not a dict",
        ]
        result = build_reservations_from_line_items(items, ORG_ID)
        assert len(result) == 1
        assert result[0].res_code == "A"
