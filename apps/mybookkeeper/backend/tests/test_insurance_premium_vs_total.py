"""The premium and the total are two numbers, and each answers its own question.

A surplus-lines policy bills `premium + fees + taxes = total`, and the two ends
of that are ~15% apart. Which one belongs where is not a matter of taste:

* the overpaying comparison measures against a county average, and county
  averages are PREMIUMS — a total on that side of the scale reports a fairly
  priced policy as over market;
* the books want the TOTAL, because that is the amount that left the account.

Storing one figure could only ever answer one of those, and answered the other
wrongly without saying so. These tests pin the split, the arithmetic over it,
and the one thing most likely to be got wrong later — that fees are levied per
policy term and must not be annualised alongside a monthly premium.

The figures throughout are the real 2026 renewal for 6732 Peerless St, because
a fabricated dec page is exactly what failed to catch this in the first place.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest

from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary
from app.services.insurance.premium_math import (
    annual_premium_cents,
    annual_total_cents,
)

# Certain Underwriters at Lloyd's of London, policy WSG10007450DFR1.
PREMIUM = 259_100          # $2,591.00 — the risk price
INSPECTION_FEE = 6_500     # $65.00
POLICY_FEE = 16_000        # $160.00
AGENT_FEE = 3_000          # $30.00
SURPLUS_LINES_TAX = 13_803  # $138.03 — 4.85% of premium + fees
STAMPING_FEE = 114         # $1.14 — 0.04% of premium + fees
FEES_AND_TAXES = (
    INSPECTION_FEE + POLICY_FEE + AGENT_FEE + SURPLUS_LINES_TAX + STAMPING_FEE
)
TOTAL = 298_517            # $2,985.17 — what leaves the account


def _summary(**overrides) -> InsurancePolicySummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    fields = {
        "id": uuid.uuid4(),
        "property_id": uuid.uuid4(),
        "policy_name": "Lloyd's Certificate TDP 3 — 6732 Peerless St",
        "premium_cents": PREMIUM,
        "premium_frequency": "annual",
        "fees_and_taxes_cents": FEES_AND_TAXES,
        "coverage_amount_cents": 33_120_000,
        "created_at": now,
        "updated_at": now,
    }
    fields.update(overrides)
    return InsurancePolicySummary(**fields)


class TestTheRealDeclarationsPage:
    def test_the_documents_own_arithmetic_reconciles(self) -> None:
        """Guards the constants: if these drift, every case below is fiction."""
        assert PREMIUM + FEES_AND_TAXES == TOTAL

    def test_the_premium_is_the_premium_not_the_total(self) -> None:
        # The whole defect in one assertion. Before the split, this column held
        # $2,985.17 and every comparison ran 15% hot off the back of it.
        assert _summary().annual_premium_cents == PREMIUM
        assert _summary().annual_premium_cents != TOTAL

    def test_the_total_is_what_actually_gets_paid(self) -> None:
        assert _summary().annual_total_cents == TOTAL

    def test_the_gap_between_them_is_the_paperwork(self) -> None:
        row = _summary()
        assert row.annual_total_cents - row.annual_premium_cents == FEES_AND_TAXES


class TestFeesAreLeviedPerTermNotPerPayment:
    def test_a_monthly_premium_does_not_pay_the_state_tax_twelve_times(
        self,
    ) -> None:
        """The trap this design exists to avoid.

        Annualising the fees alongside the premium would bill Texas surplus
        lines tax once a month. The premium annualises; the fees are added once.
        """
        monthly = _summary(premium_cents=11_200, premium_frequency="monthly")

        assert monthly.annual_premium_cents == 11_200 * 12
        assert monthly.annual_total_cents == 11_200 * 12 + FEES_AND_TAXES
        assert monthly.annual_total_cents != (11_200 + FEES_AND_TAXES) * 12


class TestWhatIsMissingStaysMissing:
    def test_no_fees_recorded_leaves_the_total_equal_to_the_premium(self) -> None:
        """An admitted carrier charges none, and that is a real policy."""
        row = _summary(fees_and_taxes_cents=None)
        assert row.annual_total_cents == PREMIUM

    def test_zero_fees_is_the_same_answer_as_none(self) -> None:
        assert _summary(fees_and_taxes_cents=0).annual_total_cents == PREMIUM

    def test_fees_without_a_premium_are_not_a_cost_of_insurance(self) -> None:
        """Reporting them alone would price the policy at its paperwork."""
        row = _summary(premium_cents=None, premium_frequency=None)
        assert row.annual_premium_cents is None
        assert row.annual_total_cents is None

    @pytest.mark.parametrize("frequency", [None, "fortnightly", ""])
    def test_an_unusable_frequency_yields_neither_figure(
        self, frequency: str | None,
    ) -> None:
        """A wrong annualisation is indistinguishable from a real difference."""
        assert annual_premium_cents(PREMIUM, frequency) is None
        assert annual_total_cents(PREMIUM, frequency, FEES_AND_TAXES) is None
