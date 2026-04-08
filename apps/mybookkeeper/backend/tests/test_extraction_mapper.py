"""Tests for extraction_mapper — tag sanitization, review status, and derivation helpers."""
import uuid
from decimal import Decimal

import pytest

from app.mappers.extraction_mapper import (
    derive_category,
    derive_schedule_e_line,
    derive_transaction_type,
    determine_review_status,
    sanitize_extraction_tags,
)


class TestSanitizeExtractionTags:
    def test_valid_single_tag(self) -> None:
        assert sanitize_extraction_tags(["maintenance"]) == ["maintenance"]

    def test_uncategorized_fallback_on_empty(self) -> None:
        assert sanitize_extraction_tags([]) == ["uncategorized"]

    def test_uncategorized_fallback_on_none(self) -> None:
        assert sanitize_extraction_tags(None) == ["uncategorized"]

    def test_linen_kept_with_allowed_tag(self) -> None:
        result = sanitize_extraction_tags(["maintenance", "linen"])
        assert "linen" in result
        assert "maintenance" in result

    def test_linen_removed_with_revenue_tag(self) -> None:
        result = sanitize_extraction_tags(["rental_revenue", "linen"])
        assert "linen" not in result
        assert "rental_revenue" in result

    def test_linen_removed_with_non_allowed_expense(self) -> None:
        result = sanitize_extraction_tags(["insurance", "linen"])
        assert "linen" not in result
        assert "insurance" in result

    def test_linen_kept_with_cleaning_expense(self) -> None:
        result = sanitize_extraction_tags(["cleaning_expense", "linen"])
        assert "linen" in result

    def test_linen_kept_with_contract_work(self) -> None:
        result = sanitize_extraction_tags(["contract_work", "linen"])
        assert "linen" in result

    def test_linen_kept_with_other_expense(self) -> None:
        result = sanitize_extraction_tags(["other_expense", "linen"])
        assert "linen" in result


class TestDetermineReviewStatus:
    def test_no_useful_data(self) -> None:
        status, reason, fields = determine_review_status(
            vendor=None, amount=None, document_type="invoice",
            property_id=None, tags=["uncategorized"],
        )
        assert status == "needs_review"
        assert "Could not extract" in reason
        assert "vendor" in fields
        assert "amount" in fields

    def test_unrecognized_document_type(self) -> None:
        status, reason, fields = determine_review_status(
            vendor="Acme", amount=Decimal("100"), document_type="other",
            property_id=None, tags=["other_expense"],
        )
        assert status == "needs_review"
        assert "Unrecognized" in reason
        assert "document_type" in fields

    def test_missing_property_for_required_tag(self) -> None:
        status, reason, fields = determine_review_status(
            vendor="Acme", amount=Decimal("100"), document_type="invoice",
            property_id=None, tags=["maintenance"],
        )
        assert status == "needs_review"
        assert "property" in reason.lower()
        assert "property_id" in fields

    def test_property_present_for_required_tag(self) -> None:
        status, reason, fields = determine_review_status(
            vendor="Acme", amount=Decimal("100"), document_type="invoice",
            property_id=uuid.uuid4(), tags=["maintenance"],
        )
        assert status == "approved"
        assert reason is None
        assert fields == []

    def test_uncategorized_tag_does_not_require_property(self) -> None:
        status, reason, fields = determine_review_status(
            vendor="Acme", amount=Decimal("100"), document_type="lease",
            property_id=None, tags=["uncategorized"],
        )
        assert status == "approved"

    def test_vendor_only_is_useful_data(self) -> None:
        status, _, _ = determine_review_status(
            vendor="Acme", amount=None, document_type="invoice",
            property_id=uuid.uuid4(), tags=["other_expense"],
        )
        assert status == "approved"

    def test_amount_only_is_useful_data(self) -> None:
        status, _, _ = determine_review_status(
            vendor=None, amount=Decimal("50"), document_type="invoice",
            property_id=uuid.uuid4(), tags=["other_expense"],
        )
        assert status == "approved"


class TestDeriveTransactionType:
    def test_revenue_tag_returns_income(self) -> None:
        assert derive_transaction_type(["rental_revenue"]) == "income"

    def test_cleaning_fee_revenue_returns_income(self) -> None:
        assert derive_transaction_type(["cleaning_fee_revenue"]) == "income"

    def test_expense_tag_returns_expense(self) -> None:
        assert derive_transaction_type(["maintenance"]) == "expense"

    def test_mixed_tags_returns_income(self) -> None:
        assert derive_transaction_type(["linen", "rental_revenue"]) == "income"

    def test_uncategorized_returns_expense(self) -> None:
        assert derive_transaction_type(["uncategorized"]) == "expense"

    def test_empty_tags_returns_expense(self) -> None:
        assert derive_transaction_type([]) == "expense"


class TestDeriveCategory:
    def test_revenue_tag(self) -> None:
        assert derive_category(["rental_revenue"]) == "rental_revenue"

    def test_expense_tag(self) -> None:
        assert derive_category(["maintenance"]) == "maintenance"

    def test_multiple_tags_returns_first_financial(self) -> None:
        assert derive_category(["linen", "cleaning_expense"]) == "cleaning_expense"

    def test_no_financial_tag_returns_uncategorized(self) -> None:
        assert derive_category(["linen", "other_non_financial"]) == "uncategorized"

    def test_empty_tags_returns_uncategorized(self) -> None:
        assert derive_category([]) == "uncategorized"

    def test_revenue_before_expense(self) -> None:
        assert derive_category(["rental_revenue", "maintenance"]) == "rental_revenue"


class TestDeriveScheduleELine:
    def test_rental_revenue(self) -> None:
        assert derive_schedule_e_line("rental_revenue") == "line_3_rents_received"

    def test_maintenance(self) -> None:
        assert derive_schedule_e_line("maintenance") == "line_7_cleaning_maintenance"

    def test_mortgage_principal_is_none(self) -> None:
        assert derive_schedule_e_line("mortgage_principal") is None

    def test_uncategorized_is_none(self) -> None:
        assert derive_schedule_e_line("uncategorized") is None

    def test_unknown_category_is_none(self) -> None:
        assert derive_schedule_e_line("nonexistent") is None

    def test_insurance(self) -> None:
        assert derive_schedule_e_line("insurance") == "line_9_insurance"

    def test_utilities(self) -> None:
        assert derive_schedule_e_line("utilities") == "line_17_utilities"
