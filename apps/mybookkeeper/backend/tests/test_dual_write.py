"""Tests for dual-write helpers in document_extraction_service."""
import uuid
from datetime import datetime
from decimal import Decimal

import pytest

from app.mappers.transaction_mapper import build_transaction_from_mapped_item
from app.mappers.reservation_mapper import build_reservations_from_line_items
from app.mappers.extraction_mapper import MappedItem


def _make_item(**overrides) -> MappedItem:
    defaults = {
        "vendor": "Test Vendor",
        "date": datetime(2025, 6, 15),
        "amount": Decimal("150.00"),
        "description": "Test invoice",
        "tags": ["maintenance"],
        "tax_relevant": True,
        "channel": "airbnb",
        "address": "123 Main St",
        "document_type": "invoice",
        "line_items": None,
        "confidence": "high",
        "property_id": uuid.uuid4(),
        "status": "pending",
        "review_fields": [],
        "review_reason": None,
        "raw_data": {},
    }
    defaults.update(overrides)
    return MappedItem(**defaults)


class TestBuildTransactionFromItem:
    def test_creates_transaction_for_expense(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        ext_id = uuid.uuid4()
        item = _make_item(tags=["maintenance"])
        txn = build_transaction_from_mapped_item(item, org_id, user_id, ext_id)
        assert txn is not None
        assert txn.organization_id == org_id
        assert txn.user_id == user_id
        assert txn.extraction_id == ext_id
        assert txn.transaction_type == "expense"
        assert txn.category == "maintenance"
        assert txn.amount == Decimal("150.00")
        assert txn.tax_year == 2025
        assert txn.schedule_e_line == "line_7_cleaning_maintenance"

    def test_creates_transaction_for_income(self) -> None:
        item = _make_item(tags=["rental_revenue"])
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is not None
        assert txn.transaction_type == "income"
        assert txn.category == "rental_revenue"
        assert txn.schedule_e_line == "line_3_rents_received"

    def test_returns_none_when_no_date(self) -> None:
        item = _make_item(date=None)
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is None

    def test_returns_none_when_amount_is_none(self) -> None:
        item = _make_item(amount=None)
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is None

    def test_returns_none_when_amount_is_zero(self) -> None:
        item = _make_item(amount=Decimal("0"))
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is None

    def test_uses_absolute_amount(self) -> None:
        item = _make_item(amount=Decimal("-200.00"))
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is not None
        assert txn.amount == Decimal("200.00")

    def test_uncategorized_fallback(self) -> None:
        item = _make_item(tags=["linen"])
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is not None
        assert txn.category == "uncategorized"
        assert txn.schedule_e_line is None

    def test_review_fields_stored(self) -> None:
        item = _make_item(review_fields=["vendor", "amount"])
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is not None
        assert txn.review_fields == ["vendor", "amount"]

    def test_empty_review_fields_stored_as_none(self) -> None:
        item = _make_item(review_fields=[])
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is not None
        assert txn.review_fields is None

    def test_property_id_carried_through(self) -> None:
        prop_id = uuid.uuid4()
        item = _make_item(property_id=prop_id)
        txn = build_transaction_from_mapped_item(item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        assert txn is not None
        assert txn.property_id == prop_id


class TestBuildReservationsFromLineItems:
    def test_creates_reservation_from_valid_line_item(self) -> None:
        org_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        txn_id = uuid.uuid4()
        line_items = [
            {
                "res_code": "ABC123",
                "check_in": "2025-06-01",
                "check_out": "2025-06-05",
                "channel": "airbnb",
                "gross_booking": "500.00",
                "net_client_earnings": "400.00",
                "guest_name": "John Doe",
            }
        ]
        reservations = build_reservations_from_line_items(line_items, org_id, prop_id, txn_id)
        assert len(reservations) == 1
        res = reservations[0]
        assert res.res_code == "ABC123"
        assert res.organization_id == org_id
        assert res.property_id == prop_id
        assert res.transaction_id == txn_id
        assert res.platform == "airbnb"
        assert res.gross_booking == Decimal("500.00")
        assert res.net_client_earnings == Decimal("400.00")
        assert res.guest_name == "John Doe"

    def test_skips_line_item_without_res_code(self) -> None:
        line_items = [{"check_in": "2025-06-01", "check_out": "2025-06-05"}]
        reservations = build_reservations_from_line_items(line_items, uuid.uuid4(), None, None)
        assert len(reservations) == 0

    def test_skips_line_item_without_dates(self) -> None:
        line_items = [{"res_code": "ABC123"}]
        reservations = build_reservations_from_line_items(line_items, uuid.uuid4(), None, None)
        assert len(reservations) == 0

    def test_returns_empty_for_none(self) -> None:
        reservations = build_reservations_from_line_items(None, uuid.uuid4(), None, None)
        assert len(reservations) == 0

    def test_returns_empty_for_empty_list(self) -> None:
        reservations = build_reservations_from_line_items([], uuid.uuid4(), None, None)
        assert len(reservations) == 0

    def test_skips_non_dict_items(self) -> None:
        line_items = ["not_a_dict", 42]
        reservations = build_reservations_from_line_items(line_items, uuid.uuid4(), None, None)
        assert len(reservations) == 0

    def test_multiple_valid_line_items(self) -> None:
        line_items = [
            {"res_code": "A1", "check_in": "2025-06-01", "check_out": "2025-06-03"},
            {"res_code": "A2", "check_in": "2025-06-05", "check_out": "2025-06-08"},
        ]
        reservations = build_reservations_from_line_items(line_items, uuid.uuid4(), None, None)
        assert len(reservations) == 2
        assert reservations[0].res_code == "A1"
        assert reservations[1].res_code == "A2"

    def test_platform_from_platform_key(self) -> None:
        line_items = [
            {"res_code": "X1", "check_in": "2025-06-01", "check_out": "2025-06-02", "platform": "vrbo", "gross_booking": "100.00"}
        ]
        reservations = build_reservations_from_line_items(line_items, uuid.uuid4(), None, None)
        assert reservations[0].platform == "vrbo"

    def test_platform_cleared_when_no_gross_booking(self) -> None:
        """DB constraint requires gross_booking when platform is set."""
        line_items = [
            {"res_code": "X1", "check_in": "2025-06-01", "check_out": "2025-06-02", "platform": "vrbo"}
        ]
        reservations = build_reservations_from_line_items(line_items, uuid.uuid4(), None, None)
        assert reservations[0].platform is None
