"""The status rules for a transaction marked a personal transfer."""
import pytest

from app.models.transactions.transaction import Transaction
from app.services.transactions.personal_transfer_status import (
    assert_status_editable,
    carry_personal_transfer,
    mark_personal_transfer,
    set_status,
    unmark_personal_transfer,
)


def _txn(status: str) -> Transaction:
    return Transaction(status=status)


@pytest.mark.parametrize("prior", ["pending", "needs_review", "unverified", "approved"])
def test_mark_then_unmark_restores_the_status(prior: str) -> None:
    txn = _txn(prior)
    mark_personal_transfer(txn)
    assert txn.status == "personal_transfer"
    assert txn.status_before_personal_transfer == prior
    unmark_personal_transfer(txn)
    assert txn.status == prior
    assert txn.status_before_personal_transfer is None


def test_marking_twice_keeps_the_first_prior_status() -> None:
    txn = _txn("approved")
    mark_personal_transfer(txn)
    mark_personal_transfer(txn)
    assert txn.status_before_personal_transfer == "approved"


def test_a_duplicate_cannot_be_marked() -> None:
    with pytest.raises(ValueError):
        mark_personal_transfer(_txn("duplicate"))


def test_unmarking_an_unmarked_row_raises() -> None:
    with pytest.raises(ValueError):
        unmark_personal_transfer(_txn("approved"))


def test_set_status_on_a_personal_transfer_changes_only_what_unmarking_restores() -> None:
    txn = _txn("approved")
    mark_personal_transfer(txn)
    set_status(txn, "needs_review")
    assert txn.status == "personal_transfer"
    assert txn.status_before_personal_transfer == "needs_review"


def test_set_status_on_an_ordinary_row_sets_it() -> None:
    txn = _txn("pending")
    set_status(txn, "approved")
    assert txn.status == "approved"
    assert txn.status_before_personal_transfer is None


def test_a_replacement_row_stays_a_personal_transfer() -> None:
    old = _txn("approved")
    mark_personal_transfer(old)
    new = _txn("unverified")
    carry_personal_transfer(old, new)
    assert new.status == "personal_transfer"
    assert new.status_before_personal_transfer == "unverified"


def test_a_replacement_for_an_ordinary_row_is_untouched() -> None:
    new = _txn("unverified")
    carry_personal_transfer(_txn("approved"), new)
    assert new.status == "unverified"


def test_plain_status_edits_cannot_mark_or_unmark() -> None:
    with pytest.raises(ValueError):
        assert_status_editable(_txn("pending"), "personal_transfer")
    marked = _txn("approved")
    mark_personal_transfer(marked)
    with pytest.raises(ValueError):
        assert_status_editable(marked, "approved")
    assert_status_editable(_txn("pending"), "approved")
