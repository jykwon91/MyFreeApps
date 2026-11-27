"""The rule for money sent to yourself across two accounts at different
amounts (``self_transfer``). Pure.

The composite cases are enumerated: the Wise → Chase transfer that loses a fee
pairs; the same amount on two different accounts pairs; one account on both
sides, two people's accounts, a gap bigger than a fee, more arriving than left,
a row in that names nobody, and rows too far apart never pair; and two
candidates for one row out (or two rows out for one in) are never guessed
between.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import replace
from decimal import Decimal

from app.repositories.transactions.transfer_leg import TransferLeg
from app.services.transactions.self_transfer import is_fee_sized, is_pair, names_holder, unambiguous_pairs

_DAY = _dt.date(2026, 11, 6)
_JASON = uuid.uuid4()
_WISE = uuid.uuid4()
_CHASE = uuid.uuid4()
_SAVINGS = uuid.uuid4()


def _sent(amount: str = "680.00", **changes: object) -> TransferLeg:
    """Money out of Wise under the holder's name."""
    leg = TransferLeg(
        id=uuid.uuid4(), account_id=_WISE, account_institution="Wise", account_user_id=_JASON,
        holder_name="Jason Kwon", amount=Decimal(amount), transaction_date=_DAY,
        description="Jason Kwon (Sent)", vendor=None, external_category="TRANSFER_OUT",
    )
    return replace(leg, **changes)


def _received(amount: str = "678.87", **changes: object) -> TransferLeg:
    """Money into Chase that names the bank it left."""
    leg = TransferLeg(
        id=uuid.uuid4(), account_id=_CHASE, account_institution="Chase", account_user_id=_JASON,
        holder_name="Jason Kwon", amount=Decimal(amount), transaction_date=_DAY,
        description="REAL TIME TRANSFER RECD Via WISE", vendor=None, external_category="TRANSFER_IN",
    )
    return replace(leg, **changes)


class TestNamesHolder:
    def test_full_name_any_case(self) -> None:
        assert names_holder(["JASON  KWON (Sent)"], "Jason Kwon")

    def test_in_the_vendor(self) -> None:
        assert names_holder([None, "Jason Kwon"], "Jason Kwon")

    def test_one_word_name_never_counts(self) -> None:
        assert not names_holder(["Jason's Deli"], "Jason")

    def test_no_name(self) -> None:
        assert not names_holder(["Jason Kwon (Sent)"], None)

    def test_someone_else(self) -> None:
        assert not names_holder(["Nicole Santos Felix ()"], "Jason Kwon")


class TestFeeSized:
    def test_the_wise_fee(self) -> None:
        assert is_fee_sized(Decimal("680.00"), Decimal("678.87"))
        assert is_fee_sized(Decimal("600.00"), Decimal("599.00"))

    def test_same_amount(self) -> None:
        assert is_fee_sized(Decimal("500.00"), Decimal("500.00"))

    def test_more_arriving_than_left(self) -> None:
        assert not is_fee_sized(Decimal("500.00"), Decimal("500.01"))

    def test_over_the_cap(self) -> None:
        # 0.3% but $15: more than a fee.
        assert not is_fee_sized(Decimal("5000.00"), Decimal("4985.00"))

    def test_over_the_share(self) -> None:
        # $5 but 5%: more than a fee.
        assert not is_fee_sized(Decimal("100.00"), Decimal("95.00"))


class TestIsPair:
    def test_wise_to_chase_with_a_fee(self) -> None:
        assert is_pair(_sent(), _received())

    def test_row_in_naming_the_holder(self) -> None:
        assert is_pair(_sent(), _received(description="Transfer from JASON KWON"))

    def test_bank_csv_rows_with_no_category(self) -> None:
        assert is_pair(_sent(external_category=None), _received(external_category=None))

    def test_same_account_on_both_sides(self) -> None:
        assert not is_pair(_sent(), _received(account_id=_WISE))

    def test_another_persons_account(self) -> None:
        assert not is_pair(_sent(), _received(account_user_id=uuid.uuid4()))

    def test_row_in_naming_nobody(self) -> None:
        assert not is_pair(_sent(), _received(description="ZELLE FROM NICOLE SANTOS"))

    def test_row_out_not_naming_the_holder(self) -> None:
        assert not is_pair(_sent(description="Nicole Santos Felix ()"), _received())

    def test_row_out_the_bank_called_spending(self) -> None:
        assert not is_pair(_sent(external_category="GENERAL_MERCHANDISE"), _received())

    def test_row_in_the_bank_called_income(self) -> None:
        assert not is_pair(_sent(), _received(external_category="INCOME"))

    def test_too_far_apart(self) -> None:
        assert not is_pair(_sent(), _received(transaction_date=_DAY + _dt.timedelta(days=6)))

    def test_a_few_days_apart(self) -> None:
        assert is_pair(_sent(), _received(transaction_date=_DAY + _dt.timedelta(days=2)))

    def test_gap_bigger_than_a_fee(self) -> None:
        assert not is_pair(_sent(), _received(amount="650.00"))


class TestUnambiguousPairs:
    def test_each_transfer_pairs_with_its_own_arrival(self) -> None:
        first_out, second_out = _sent(), _sent("600.00", transaction_date=_DAY + _dt.timedelta(days=12))
        first_in, second_in = _received(), _received("599.00", transaction_date=_DAY + _dt.timedelta(days=12))
        pairs = unambiguous_pairs([first_out, second_out], [first_in, second_in])
        assert {(o.id, i.id) for o, i in pairs} == {(first_out.id, first_in.id), (second_out.id, second_in.id)}

    def test_same_amount_on_two_different_accounts_pairs(self) -> None:
        out = _sent("500.00")
        into = _received("500.00", account_id=_SAVINGS)
        assert [(o.id, i.id) for o, i in unambiguous_pairs([out], [into])] == [(out.id, into.id)]

    def test_two_candidates_for_one_row_out_pair_neither(self) -> None:
        out = _sent()
        assert unambiguous_pairs([out], [_received(), _received("679.50", account_id=_SAVINGS)]) == []

    def test_two_rows_out_for_one_row_in_pair_neither(self) -> None:
        into = _received()
        assert unambiguous_pairs([_sent(), _sent("679.00", account_id=_SAVINGS)], [into]) == []

    def test_nothing_to_pair(self) -> None:
        assert unambiguous_pairs([_sent()], []) == []
