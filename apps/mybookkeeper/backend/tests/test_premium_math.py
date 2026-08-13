"""Tests for insurance premium annualisation.

Annualisation is what makes two policies comparable, so a wrong answer here is
worse than no answer: it is indistinguishable from a real price difference once
it reaches a comparison.
"""
from __future__ import annotations

import pytest

from app.core.insurance_enums import PREMIUM_FREQUENCIES, PREMIUM_PAYMENTS_PER_YEAR
from app.services.insurance.premium_math import annual_premium_cents


class TestAnnualPremiumCents:
    @pytest.mark.parametrize(
        ("frequency", "expected"),
        [
            ("annual", 124000),
            ("semiannual", 248000),
            ("quarterly", 496000),
            ("monthly", 1488000),
        ],
    )
    def test_multiplies_by_payments_per_year(self, frequency: str, expected: int) -> None:
        assert annual_premium_cents(124000, frequency) == expected

    def test_monthly_premium_annualises_to_twelve_payments(self) -> None:
        # $112/mo → $1,344/yr. The 12x gap is the whole reason the frequency is
        # stored beside the amount.
        assert annual_premium_cents(11200, "monthly") == 134400

    def test_returns_none_when_amount_is_unrecorded(self) -> None:
        assert annual_premium_cents(None, "monthly") is None

    def test_returns_none_when_frequency_is_unrecorded(self) -> None:
        assert annual_premium_cents(11200, None) is None

    def test_returns_none_for_an_unknown_frequency(self) -> None:
        # Not a fallback to "annual": guessing would understate a monthly
        # premium by 12x, and the error would be invisible downstream.
        assert annual_premium_cents(11200, "fortnightly") is None

    def test_covers_every_frequency_the_column_accepts(self) -> None:
        # A frequency the CHECK constraint allows but the math does not know
        # would silently annualise to None for a policy that has a premium.
        for frequency in PREMIUM_FREQUENCIES:
            assert annual_premium_cents(100, frequency) is not None

    def test_payments_per_year_matches_the_allowed_frequencies(self) -> None:
        assert set(PREMIUM_PAYMENTS_PER_YEAR) == set(PREMIUM_FREQUENCIES)
