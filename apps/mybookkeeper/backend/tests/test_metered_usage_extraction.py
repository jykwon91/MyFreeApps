"""Tests for metered-usage extraction from Claude output.

A utility bill's dollar amount is not comparable across months without the
quantity it was charged on, so these cover both that the quantity is captured
and — more importantly — that a half-captured or nonsensical one is dropped
rather than stored as if it were trustworthy.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.mappers.extraction_mapper import extract_usage, map_single_item
from app.mappers.transaction_mapper import (
    build_transaction_from_extraction_data,
    build_transaction_from_mapped_item,
)
from app.models.extraction.metered_usage import MeteredUsage


def _bill(**overrides) -> dict:
    data = {
        "usage_quantity": "1042.000",
        "usage_unit": "kwh",
        "service_period_start": "2025-07-12",
        "service_period_end": "2025-08-11",
    }
    data.update(overrides)
    return data


class TestExtractUsage:
    def test_captures_full_usage_on_a_utilities_bill(self) -> None:
        usage = extract_usage(_bill(), "utilities")
        assert usage.quantity == Decimal("1042.000")
        assert usage.unit == "kwh"
        assert usage.period_start == date(2025, 7, 12)
        assert usage.period_end == date(2025, 8, 11)

    @pytest.mark.parametrize("category", ["maintenance", "rental_revenue", "uncategorized"])
    def test_ignored_for_non_utility_categories(self, category: str) -> None:
        assert extract_usage(_bill(), category).is_empty

    def test_quantity_without_unit_is_dropped(self) -> None:
        usage = extract_usage(_bill(usage_unit=None), "utilities")
        assert usage.quantity is None
        assert usage.unit is None

    def test_unit_without_quantity_is_dropped(self) -> None:
        usage = extract_usage(_bill(usage_quantity=None), "utilities")
        assert usage.quantity is None
        assert usage.unit is None

    def test_unknown_unit_drops_the_pair(self) -> None:
        usage = extract_usage(_bill(usage_unit="widgets"), "utilities")
        assert usage.quantity is None
        assert usage.unit is None

    def test_unit_is_normalized_to_lowercase(self) -> None:
        assert extract_usage(_bill(usage_unit="KWH"), "utilities").unit == "kwh"

    def test_negative_quantity_is_dropped(self) -> None:
        usage = extract_usage(_bill(usage_quantity="-50"), "utilities")
        assert usage.quantity is None
        assert usage.unit is None

    def test_unparseable_quantity_is_dropped_not_guessed(self) -> None:
        # The prompt asks for separators to be stripped; if one slips through we
        # drop it rather than store a mis-parsed number.
        usage = extract_usage(_bill(usage_quantity="1,042"), "utilities")
        assert usage.quantity is None
        assert usage.unit is None

    def test_service_period_survives_a_missing_quantity(self) -> None:
        # A notification with no consumption still tells us which months the
        # dollar amount covers.
        usage = extract_usage(_bill(usage_quantity=None, usage_unit=None), "utilities")
        assert usage.quantity is None
        assert usage.period_start == date(2025, 7, 12)
        assert usage.period_end == date(2025, 8, 11)

    def test_inverted_service_period_is_dropped(self) -> None:
        usage = extract_usage(
            _bill(service_period_start="2025-08-11", service_period_end="2025-07-12"),
            "utilities",
        )
        assert usage.period_start is None
        assert usage.period_end is None
        # The consumption itself is still fine — only the period was incoherent.
        assert usage.quantity == Decimal("1042.000")

    @pytest.mark.parametrize(
        "missing", ["service_period_start", "service_period_end"],
    )
    def test_one_sided_period_is_dropped(self, missing: str) -> None:
        # Half a period cannot bucket anything, and the DB pairs the boundaries.
        usage = extract_usage(_bill(**{missing: None}), "utilities")
        assert usage.period_start is None
        assert usage.period_end is None
        # The consumption itself is untouched.
        assert usage.quantity == Decimal("1042.000")

    def test_kgal_is_a_distinct_unit_from_gallon(self) -> None:
        # Municipal water bills read in thousands of gallons; collapsing the two
        # is a 1000x error.
        usage = extract_usage(_bill(usage_quantity="12", usage_unit="kgal"), "utilities")
        assert usage.quantity == Decimal("12")
        assert usage.unit == "kgal"

    def test_zero_usage_is_kept(self) -> None:
        # A vacant month legitimately bills 0 against the base charge.
        usage = extract_usage(_bill(usage_quantity="0"), "utilities")
        assert usage.quantity == Decimal("0")
        assert usage.unit == "kwh"

    def test_missing_keys_yield_empty_usage(self) -> None:
        assert extract_usage({}, "utilities").is_empty


class TestMappedItemCarriesUsage:
    def test_utility_bill_item_carries_usage(self) -> None:
        item = map_single_item(_bill(tags=["utilities"], sub_category="electricity"), None)
        assert item.usage.quantity == Decimal("1042.000")
        assert item.usage.unit == "kwh"

    def test_non_utility_item_has_empty_usage(self) -> None:
        item = map_single_item(_bill(tags=["maintenance"]), None)
        assert item.usage.is_empty

    def test_defaults_to_empty_usage_when_absent(self) -> None:
        item = map_single_item({"tags": ["utilities"]}, None)
        assert item.usage.is_empty


class TestMeteredUsage:
    def test_empty_is_empty(self) -> None:
        assert MeteredUsage.empty().is_empty

    def test_populated_is_not_empty(self) -> None:
        assert not MeteredUsage(Decimal("1"), "kwh", None, None).is_empty

    def test_period_only_is_not_empty(self) -> None:
        assert not MeteredUsage(None, None, date(2025, 7, 12), date(2025, 8, 11)).is_empty


class TestBothIngestPathsPromoteUsage:
    """Usage must land identically whether the bill arrived as an upload or via
    Gmail sync — a gap on one path makes any blended rate quietly wrong."""

    def _payload(self) -> dict:
        return _bill(
            tags=["utilities"], sub_category="electricity", category="utilities",
            vendor="Constellation", amount="187.54", date="2025-08-01",
        )

    def test_upload_path_promotes_usage(self) -> None:
        item = map_single_item(self._payload(), None)
        txn = build_transaction_from_mapped_item(
            item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(),
        )
        assert txn is not None
        assert txn.usage_quantity == Decimal("1042.000")
        assert txn.usage_unit == "kwh"
        assert txn.service_period_start == date(2025, 7, 12)
        assert txn.service_period_end == date(2025, 8, 11)

    def test_email_path_promotes_usage(self) -> None:
        txn = build_transaction_from_extraction_data(
            self._payload(),
            organization_id=uuid.uuid4(), user_id=uuid.uuid4(), property_id=None,
            extraction_id=uuid.uuid4(), doc_date=datetime(2025, 8, 1),
            amount=Decimal("187.54"), vendor="Constellation", category="utilities",
            tags=["utilities"], txn_type="expense",
        )
        assert txn.usage_quantity == Decimal("1042.000")
        assert txn.usage_unit == "kwh"
        assert txn.service_period_start == date(2025, 7, 12)
        assert txn.service_period_end == date(2025, 8, 11)

    def test_non_utility_category_carries_no_usage_on_either_path(self) -> None:
        data = _bill(tags=["maintenance"], category="maintenance",
                     vendor="ABC Plumbing", amount="425.00", date="2025-08-01")

        item = map_single_item(data, None)
        upload = build_transaction_from_mapped_item(
            item, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(),
        )
        assert upload is not None
        assert upload.usage_quantity is None
        assert upload.service_period_start is None

        email = build_transaction_from_extraction_data(
            data, organization_id=uuid.uuid4(), user_id=uuid.uuid4(), property_id=None,
            extraction_id=uuid.uuid4(), doc_date=datetime(2025, 8, 1),
            amount=Decimal("425.00"), vendor="ABC Plumbing", category="maintenance",
            tags=["maintenance"], txn_type="expense",
        )
        assert email.usage_quantity is None
        assert email.service_period_start is None
