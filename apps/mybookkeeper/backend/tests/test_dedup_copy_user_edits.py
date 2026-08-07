"""Tests for field preservation when a dedup `replace` supersedes a transaction.

A `replace` soft-deletes the old row and keeps the new one. Anything not copied
across is lost with no error and no log line — the analytics queries filter on
`deleted_at IS NULL`, so the value simply stops existing. That makes this
function a standing data-loss risk for every column added to Transaction.
"""
import uuid
from datetime import date
from decimal import Decimal

from app.models.transactions.transaction import Transaction
from app.services.extraction.dedup_resolution_service import _copy_user_edits


def _txn(**overrides) -> Transaction:
    base = {
        "transaction_date": date(2025, 8, 1), "tax_year": 2025,
        "amount": Decimal("187.54"), "transaction_type": "expense",
        "category": "utilities", "status": "approved",
    }
    base.update(overrides)
    return Transaction(**base)


class TestCopyUserEdits:
    def test_carries_usage_when_replacement_lacks_it(self) -> None:
        # The common arrival order: the PDF statement (with kWh) lands first and
        # is later superseded by a notification that has only an amount.
        old = _txn(usage_quantity=Decimal("1042.000"), usage_unit="kwh")
        new = _txn()
        _copy_user_edits(old, new)
        assert new.usage_quantity == Decimal("1042.000")
        assert new.usage_unit == "kwh"

    def test_usage_quantity_and_unit_move_together(self) -> None:
        # chk_txn_usage_paired rejects half a pair, so copying one without the
        # other would turn a silent loss into a failed insert.
        old = _txn(usage_quantity=Decimal("1042.000"), usage_unit="kwh")
        new = _txn()
        _copy_user_edits(old, new)
        assert (new.usage_quantity is None) == (new.usage_unit is None)

    def test_does_not_overwrite_usage_the_replacement_already_has(self) -> None:
        old = _txn(usage_quantity=Decimal("1042.000"), usage_unit="kwh")
        new = _txn(usage_quantity=Decimal("999.000"), usage_unit="kwh")
        _copy_user_edits(old, new)
        assert new.usage_quantity == Decimal("999.000")

    def test_carries_service_period(self) -> None:
        old = _txn(
            service_period_start=date(2025, 7, 12), service_period_end=date(2025, 8, 11),
        )
        new = _txn()
        _copy_user_edits(old, new)
        assert new.service_period_start == date(2025, 7, 12)
        assert new.service_period_end == date(2025, 8, 11)

    def test_service_period_boundaries_move_together(self) -> None:
        old = _txn(
            service_period_start=date(2025, 7, 12), service_period_end=date(2025, 8, 11),
        )
        new = _txn()
        _copy_user_edits(old, new)
        assert (new.service_period_start is None) == (new.service_period_end is None)

    def test_carries_sub_category(self) -> None:
        # Pre-existing loss: sub_category has been silently dropped on every
        # replace since the column shipped.
        old = _txn(sub_category="electricity")
        new = _txn()
        _copy_user_edits(old, new)
        assert new.sub_category == "electricity"

    def test_does_not_overwrite_sub_category_the_replacement_has(self) -> None:
        old = _txn(sub_category="electricity")
        new = _txn(sub_category="gas")
        _copy_user_edits(old, new)
        assert new.sub_category == "gas"

    def test_still_carries_the_original_fields(self) -> None:
        pid = uuid.uuid4()
        old = _txn(property_id=pid, category="maintenance", tags=["maintenance"],
                   schedule_e_line="line_14_repairs")
        new = _txn(category="uncategorized", tags=[])
        _copy_user_edits(old, new)
        assert new.property_id == pid
        assert new.category == "maintenance"
        assert new.tags == ["maintenance"]
        assert new.schedule_e_line == "line_14_repairs"

    def test_no_usage_on_either_side_is_a_noop(self) -> None:
        old, new = _txn(), _txn()
        _copy_user_edits(old, new)
        assert new.usage_quantity is None
        assert new.usage_unit is None
        assert new.service_period_start is None
