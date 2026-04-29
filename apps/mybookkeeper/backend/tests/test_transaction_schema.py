"""Tests for transaction schema Literal type validation."""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.transactions.transaction import TransactionCreate, TransactionUpdate


class TestTransactionCreateValidation:
    def _valid_payload(self, **overrides) -> dict:
        base = {
            "transaction_date": date(2025, 6, 1),
            "amount": Decimal("100.00"),
            "transaction_type": "expense",
            "category": "maintenance",
        }
        base.update(overrides)
        return base

    def test_valid_expense(self) -> None:
        txn = TransactionCreate(**self._valid_payload())
        assert txn.transaction_type == "expense"
        assert txn.category == "maintenance"

    def test_valid_income(self) -> None:
        txn = TransactionCreate(**self._valid_payload(
            transaction_type="income", category="rental_revenue",
        ))
        assert txn.transaction_type == "income"

    def test_rejects_invalid_transaction_type(self) -> None:
        with pytest.raises(ValidationError):
            TransactionCreate(**self._valid_payload(transaction_type="refund"))

    def test_rejects_invalid_category(self) -> None:
        with pytest.raises(ValidationError):
            TransactionCreate(**self._valid_payload(category="groceries"))

    def test_rejects_invalid_channel(self) -> None:
        with pytest.raises(ValidationError):
            TransactionCreate(**self._valid_payload(channel="zillow"))

    def test_accepts_valid_channel(self) -> None:
        txn = TransactionCreate(**self._valid_payload(channel="airbnb"))
        assert txn.channel == "airbnb"

    def test_rejects_invalid_payment_method(self) -> None:
        with pytest.raises(ValidationError):
            TransactionCreate(**self._valid_payload(payment_method="bitcoin"))

    def test_accepts_valid_payment_method(self) -> None:
        txn = TransactionCreate(**self._valid_payload(payment_method="check"))
        assert txn.payment_method == "check"

    def test_rejects_invalid_schedule_e_line(self) -> None:
        with pytest.raises(ValidationError):
            TransactionCreate(**self._valid_payload(schedule_e_line="line_99"))

    def test_accepts_valid_schedule_e_line(self) -> None:
        txn = TransactionCreate(**self._valid_payload(
            schedule_e_line="line_7_cleaning_maintenance",
        ))
        assert txn.schedule_e_line == "line_7_cleaning_maintenance"


class TestTransactionUpdateValidation:
    def test_rejects_invalid_status(self) -> None:
        with pytest.raises(ValidationError):
            TransactionUpdate(status="archived")

    def test_accepts_valid_status(self) -> None:
        txn = TransactionUpdate(status="approved")
        assert txn.status == "approved"

    def test_rejects_invalid_type(self) -> None:
        with pytest.raises(ValidationError):
            TransactionUpdate(transaction_type="credit")

    def test_all_none_is_valid(self) -> None:
        txn = TransactionUpdate()
        assert txn.transaction_type is None
        assert txn.category is None


class TestTransactionUpdateVendorId:
    """PR 4.2: ``vendor_id`` supports both "set to UUID" and "explicit null"
    semantics. The ``to_update_dict()`` helper distinguishes "field omitted"
    (drop) from "field set to null" (preserve as None) so the dropdown's
    "(none)" option can detach the link.
    """

    def test_omitted_field_is_excluded_from_payload(self) -> None:
        # Status is set, vendor_id is not even mentioned.
        txn = TransactionUpdate(status="approved")
        payload = txn.to_update_dict()
        assert "vendor_id" not in payload

    def test_explicit_null_vendor_id_is_preserved(self) -> None:
        txn = TransactionUpdate(vendor_id=None)
        # Pydantic v2 records explicit-null in model_fields_set.
        payload = txn.to_update_dict()
        assert payload.get("vendor_id") is None
        assert "vendor_id" in payload

    def test_uuid_vendor_id_is_preserved(self) -> None:
        vid = uuid.uuid4()
        txn = TransactionUpdate(vendor_id=vid)
        payload = txn.to_update_dict()
        assert payload["vendor_id"] == vid

    def test_other_none_fields_still_dropped(self) -> None:
        # Sanity check — historical behaviour (None == omitted) preserved
        # for every field except vendor_id.
        txn = TransactionUpdate(
            vendor_id=None, property_id=None, status=None,
        )
        payload = txn.to_update_dict()
        assert "vendor_id" in payload  # explicit
        assert payload["vendor_id"] is None
        assert "property_id" not in payload
        assert "status" not in payload
