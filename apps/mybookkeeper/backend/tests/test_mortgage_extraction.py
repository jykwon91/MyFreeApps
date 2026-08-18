"""Coercing a model's reading of a mortgage statement into a draft.

The cases here are the ones the three real statements produced. The one worth
reading is ``test_a_fixed_loan_with_a_reset_date_is_reported_as_adjustable`` —
that contradiction appears on an actual statement, and resolving it the other
way would erase the only signal that the loan cannot be benchmarked.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.core.mortgage_enums import RATE_TYPE_ARM, RATE_TYPE_FIXED
from app.services.mortgage.mortgage_statement_extraction_service import build_draft

DOCUMENT_ID = uuid.uuid4()


def _draft(raw: dict):
    return build_draft(raw, document_id=DOCUMENT_ID)


class TestRateAndType:
    def test_reads_a_fixed_loan(self) -> None:
        draft = _draft({"interest_rate": "7.125", "rate_type": "fixed"})
        assert draft.interest_rate == Decimal("7.125")
        assert draft.rate_type == RATE_TYPE_FIXED
        assert draft.fixed_until is None

    def test_a_fixed_loan_with_a_reset_date_is_reported_as_adjustable(self) -> None:
        """6732 Peerless prints 'Interest Rate Until February, 2035'.

        A document does not state a date the rate lasts until unless the rate
        stops there. Dropping the date instead would leave a loan that resets
        in nine years looking like a thirty-year fixed and quietly compare it
        against a yardstick that does not apply.
        """
        draft = _draft(
            {
                "interest_rate": "8.250",
                "rate_type": "fixed",
                "fixed_until": "2035-02-01",
            },
        )
        assert draft.rate_type == RATE_TYPE_ARM
        assert draft.fixed_until == _dt.date(2035, 2, 1)
        assert any("adjustable" in w for w in draft.warnings)

    def test_a_percentage_returned_as_a_fraction_is_dropped(self) -> None:
        """0.07125 for 7.125% would survive every downstream check and claim
        the loan is four hundred basis points below market."""
        assert _draft({"interest_rate": "0"}).interest_rate is None

    def test_an_absurd_rate_is_dropped(self) -> None:
        assert _draft({"interest_rate": "712.5"}).interest_rate is None

    def test_an_unknown_rate_type_is_not_guessed(self) -> None:
        draft = _draft({"rate_type": "variable-ish"})
        assert draft.rate_type is None
        assert any("fixed for the life" in w for w in draft.warnings)


class TestTermMonths:
    def test_reads_a_real_term(self) -> None:
        assert _draft({"term_months": 360}).term_months == 360

    def test_a_fifty_year_term_is_real(self) -> None:
        assert _draft({"term_months": 600}).term_months == 600

    def test_a_misread_of_something_else_is_dropped(self) -> None:
        assert _draft({"term_months": 5000}).term_months is None
        assert _draft({"term_months": 0}).term_months is None


class TestPaymentSplit:
    def test_reads_the_6734_peerless_split(self) -> None:
        draft = _draft(
            {
                "monthly_principal_cents": 30156,
                "monthly_interest_cents": 199582,
                "monthly_escrow_cents": 87081,
            },
        )
        assert draft.monthly_principal_cents == 30156
        assert draft.monthly_interest_cents == 199582
        assert draft.monthly_escrow_cents == 87081

    def test_half_a_split_is_warned_about(self) -> None:
        draft = _draft({"monthly_principal_cents": 30156})
        assert any("only half" in w for w in draft.warnings)

    def test_no_payoff_date_and_no_split_is_warned_about(self) -> None:
        """Without one or the other there is no way to count what's left."""
        draft = _draft({"interest_rate": "7.125"})
        assert any("payoff date" in w for w in draft.warnings)


class TestBalanceAndDate:
    def test_a_balance_without_a_date_is_warned_about(self) -> None:
        draft = _draft({"current_balance_cents": 33613735})
        assert any("no statement date" in w for w in draft.warnings)

    def test_a_rate_without_a_balance_is_warned_about(self) -> None:
        draft = _draft({"interest_rate": "7.125", "maturity_date": "2055-03-01"})
        assert any("not the remaining balance" in w for w in draft.warnings)


class TestDraftShape:
    def test_one_bad_field_does_not_cost_the_good_ones(self) -> None:
        draft = _draft(
            {
                "lender": "Chase",
                "interest_rate": "2.990",
                "rate_type": "fixed",
                "statement_date": "not-a-date",
                "current_balance_cents": 7846278,
                "maturity_date": "2051-02-01",
            },
        )
        assert draft.lender == "Chase"
        assert draft.interest_rate == Decimal("2.990")
        assert draft.maturity_date == _dt.date(2051, 2, 1)
        assert draft.statement_date is None

    def test_confidence_defaults_to_low(self) -> None:
        assert _draft({}).confidence == "low"
        assert _draft({"confidence": "wildly"}).confidence == "low"

    def test_confidence_is_taken_when_known(self) -> None:
        assert _draft({"confidence": "high"}).confidence == "high"

    def test_unrepresented_terms_are_kept(self) -> None:
        """A prepayment penalty has no column, and dropping it silently would
        make the loan look simpler than it is."""
        draft = _draft({"unrepresented": ["prepayment penalty through 2028"]})
        assert draft.unrepresented == ["prepayment penalty through 2028"]

    def test_the_source_document_is_always_recorded(self) -> None:
        assert _draft({}).source_document_id == DOCUMENT_ID
