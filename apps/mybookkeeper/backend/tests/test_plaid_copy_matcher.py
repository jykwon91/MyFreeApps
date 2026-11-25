"""Is a synced bank row the same money as a row on file? (pure)

Enumerated: the same payment from an email and the bank; two people paying
the same amount days apart; the same bill a month later; a vendor that is only
a payment rail; and more than one candidate either way.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.models.transactions.transaction import Transaction
from app.services.plaid.plaid_copy_matcher import is_same_money, only_copy, unambiguous_pairs

_DAY = _dt.date(2026, 11, 16)
_ZELLE = ("Zelle payment from SONU KING 31731713019", "Zelle payment from SONU KING 31731713019")


def _row(*, day: _dt.date = _DAY, **fields: object) -> Transaction:
    values: dict[str, object] = dict(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
        transaction_date=day, tax_year=day.year, amount=Decimal("338.50"),
        transaction_type="income", category="rental_revenue", status="approved",
    )
    values.update(fields)
    return Transaction(**values)


def _emailed_rent(**fields: object) -> Transaction:
    values: dict[str, object] = dict(
        vendor="Zelle", description="Zelle from Sonu King — memo: rent", payer_name="Sonu King",
    )
    values.update(fields)
    return _row(**values)


class TestPersonToPerson:
    def test_the_same_payment_from_the_alert_and_the_bank_matches(self) -> None:
        on_file = _emailed_rent(day=_DAY - _dt.timedelta(days=1))
        assert is_same_money(bank_date=_DAY, bank_texts=_ZELLE, candidate=on_file)

    def test_the_payer_is_read_from_the_description_when_not_stored(self) -> None:
        on_file = _emailed_rent(payer_name=None)
        assert is_same_money(bank_date=_DAY, bank_texts=_ZELLE, candidate=on_file)

    def test_a_different_payer_paying_the_same_amount_does_not_match(self) -> None:
        on_file = _emailed_rent(payer_name="Jane Doe", description="Zelle from Jane Doe")
        assert not is_same_money(bank_date=_DAY, bank_texts=_ZELLE, candidate=on_file)

    def test_a_row_on_file_naming_no_payer_does_not_match(self) -> None:
        on_file = _emailed_rent(payer_name=None, description="Rent")
        assert not is_same_money(bank_date=_DAY, bank_texts=_ZELLE, candidate=on_file)

    def test_four_days_apart_matches_five_does_not(self) -> None:
        assert is_same_money(
            bank_date=_DAY, bank_texts=_ZELLE, candidate=_emailed_rent(day=_DAY - _dt.timedelta(days=4)),
        )
        assert not is_same_money(
            bank_date=_DAY, bank_texts=_ZELLE, candidate=_emailed_rent(day=_DAY - _dt.timedelta(days=5)),
        )

    def test_a_wise_payment_matches_on_the_senders_name(self) -> None:
        on_file = _emailed_rent(vendor="Wise", payer_name="Nicole Santos Felix", description=None)
        assert is_same_money(bank_date=_DAY, bank_texts=("Nicole Santos Felix ()",), candidate=on_file)


class TestOtherRows:
    def _bill(self, **fields: object) -> Transaction:
        values: dict[str, object] = dict(
            transaction_type="expense", category="utilities", vendor="CenterPoint Energy",
        )
        values.update(fields)
        return _row(**values)

    def test_the_same_bill_matches_on_the_vendor_inside_the_bank_name(self) -> None:
        on_file = self._bill(day=_DAY - _dt.timedelta(days=2))
        assert is_same_money(
            bank_date=_DAY, bank_texts=("CENTERPOINT ENERGY HOUSTON TX",), candidate=on_file,
        )

    def test_a_bank_merchant_inside_a_longer_vendor_matches(self) -> None:
        on_file = self._bill(vendor="Comcast Xfinity")
        assert is_same_money(bank_date=_DAY, bank_texts=("Comcast",), candidate=on_file)

    def test_the_same_bill_a_month_later_does_not_match(self) -> None:
        on_file = self._bill(day=_DAY - _dt.timedelta(days=30))
        assert not is_same_money(bank_date=_DAY, bank_texts=("CenterPoint Energy",), candidate=on_file)

    def test_four_days_apart_is_too_far_for_a_bill(self) -> None:
        on_file = self._bill(day=_DAY - _dt.timedelta(days=4))
        assert not is_same_money(bank_date=_DAY, bank_texts=("CenterPoint Energy",), candidate=on_file)

    def test_a_different_vendor_does_not_match(self) -> None:
        on_file = self._bill(vendor="City of Houston Water")
        assert not is_same_money(bank_date=_DAY, bank_texts=("CenterPoint Energy",), candidate=on_file)

    def test_a_vendor_that_is_only_a_payment_rail_never_matches(self) -> None:
        on_file = self._bill(vendor="Zelle", category="other_expense")
        assert not is_same_money(
            bank_date=_DAY, bank_texts=("Zelle payment to JANE DOE 5551",), candidate=on_file,
        )

    def test_a_vendor_too_short_to_tell_never_matches(self) -> None:
        on_file = self._bill(vendor="AT")
        assert not is_same_money(bank_date=_DAY, bank_texts=("AT&T Wireless",), candidate=on_file)


class TestAmbiguity:
    def test_only_copy_is_none_with_two_candidates(self) -> None:
        candidates = [_emailed_rent(), _emailed_rent(day=_DAY - _dt.timedelta(days=2))]
        assert only_copy(bank_date=_DAY, bank_texts=_ZELLE, candidates=candidates) is None

    def test_only_copy_picks_the_one_that_is_the_same_money(self) -> None:
        mine = _emailed_rent()
        other = _emailed_rent(payer_name="Jane Doe", description="Zelle from Jane Doe")
        assert only_copy(bank_date=_DAY, bank_texts=_ZELLE, candidates=[other, mine]) is mine

    def _synced(self, **fields: object) -> Transaction:
        values: dict[str, object] = dict(
            vendor=_ZELLE[0], description=_ZELLE[0], category="uncategorized",
            external_source="plaid", external_id=f"p-{uuid.uuid4()}",
        )
        values.update(fields)
        return _row(**values)

    def test_a_unique_pair_is_kept(self) -> None:
        synced, on_file = self._synced(), _emailed_rent()
        assert unambiguous_pairs([(synced, on_file)]) == [(synced, on_file)]

    def test_one_synced_row_matching_two_rows_on_file_is_dropped(self) -> None:
        synced = self._synced()
        assert unambiguous_pairs([(synced, _emailed_rent()), (synced, _emailed_rent())]) == []

    def test_two_synced_rows_matching_one_row_on_file_is_dropped(self) -> None:
        on_file = _emailed_rent()
        assert unambiguous_pairs([(self._synced(), on_file), (self._synced(), on_file)]) == []

    def test_a_non_matching_pair_does_not_make_a_match_ambiguous(self) -> None:
        synced, on_file = self._synced(), _emailed_rent()
        stranger = _emailed_rent(payer_name="Jane Doe", description="Zelle from Jane Doe")
        assert unambiguous_pairs([(synced, on_file), (synced, stranger)]) == [(synced, on_file)]

    def test_a_pair_the_person_marked_not_duplicates_is_dropped(self) -> None:
        reviewed = _dt.datetime(2026, 11, 20, tzinfo=_dt.timezone.utc)
        synced = self._synced(duplicate_reviewed_at=reviewed)
        on_file = _emailed_rent(duplicate_reviewed_at=reviewed)
        assert unambiguous_pairs([(synced, on_file)]) == []

    def test_a_row_reviewed_against_something_else_still_pairs(self) -> None:
        reviewed = _dt.datetime(2026, 11, 20, tzinfo=_dt.timezone.utc)
        synced, on_file = self._synced(), _emailed_rent(duplicate_reviewed_at=reviewed)
        assert unambiguous_pairs([(synced, on_file)]) == [(synced, on_file)]
