"""Unit tests for the pure offer-scoring helpers.

No network — the fixtures are the literal shapes the Power to Choose feed
returned for ZIP 77021, so a change in the parsing rules is measured against
real data rather than invented data.
"""
from __future__ import annotations

import ast
import inspect
from decimal import Decimal

import pytest

from app.core.power_to_choose_constants import MAX_SPECIAL_TERMS_CHARS
from app.services.properties import power_to_choose_client
from app.services.properties._address_zip import derive_zip_code
from app.services.properties._offer_ranking import (
    annual_saving_cents,
    clean_special_terms,
    is_teaser_priced,
    meets_rating_bar,
    normalize_rating,
    parse_cancellation_fee_cents,
    switch_cost_cents,
)


class TestParseCancellationFee:
    """The feed writes the fee 37 different ways across 174 Houston offers."""

    @pytest.mark.parametrize(
        ("raw", "cents"),
        [
            ("Cancellation Fee: $150.00", 15000),
            ("Cancellation Fee: $175.00", 17500),
            ("Cancellation Fee: $0.00", 0),
            ("Cancellation Fee: $100", 10000),
            ("Cancellation Fee: $295.00", 29500),
            ("Cancellation Fee: $1,200.00", 120000),
        ],
    )
    def test_reads_a_flat_fee(self, raw: str, cents: int) -> None:
        assert parse_cancellation_fee_cents(raw) == (cents, False)

    @pytest.mark.parametrize(
        "raw",
        [
            "Cancellation Fee: $20 / remaining month",
            "Cancellation Fee: $20/remaining month.",
            "Cancellation Fee: $20.00 per month left in term",
            "Cancellation Fee: $20 per month remaining",
            "Cancellation Fee: $20.00 per remaining month",
        ],
    )
    def test_recognises_a_per_remaining_month_fee(self, raw: str) -> None:
        """All five phrasings mean the same thing and must not read as flat."""
        assert parse_cancellation_fee_cents(raw) == (2000, True)

    def test_absent_fee_is_none_not_zero(self) -> None:
        """"No figure stated" and "$0.00 stated" are different facts.

        Collapsing them would render an unknown exit cost as free.
        """
        assert parse_cancellation_fee_cents("Cancellation Fee: see EFL") == (None, False)
        assert parse_cancellation_fee_cents(None) == (None, False)
        assert parse_cancellation_fee_cents("Cancellation Fee: $0.00") == (0, False)


class TestTeaserPricing:
    def test_the_ap_gas_shape_is_flagged(self) -> None:
        """AP Gas SimpleSaver 12 — the cheapest headline in Houston, and a trap.

        6.20¢ at 1000 kWh against 19.2¢ at 500 and 12.2¢ at 2000: a bill credit
        that pays out only inside a narrow band. It tops a naive
        sort-by-price-at-1000, which is exactly why this check exists.
        """
        assert is_teaser_priced(Decimal("19.2"), Decimal("6.2"), Decimal("12.2"))

    def test_a_flat_curve_is_honest(self) -> None:
        """True Value 12 — 10.8 / 10.3 / 10.1, cheap all the way across."""
        assert not is_teaser_priced(Decimal("10.8"), Decimal("10.3"), Decimal("10.1"))

    def test_a_plan_dearer_at_1000_is_not_a_teaser(self) -> None:
        assert not is_teaser_priced(Decimal("10.5"), Decimal("10.5"), Decimal("10.6"))


class TestProviderRating:
    def test_feed_sentinels_read_as_unrated(self) -> None:
        """-1 and 0 mean "none on file", not "worst possible score"."""
        assert normalize_rating(-1) is None
        assert normalize_rating(0) is None

    @pytest.mark.parametrize("score", [1, 2, 3, 4, 5])
    def test_real_scores_pass_through(self, score: int) -> None:
        assert normalize_rating(score) == score

    def test_junk_reads_as_unrated(self) -> None:
        assert normalize_rating("4") is None
        assert normalize_rating(None) is None
        assert normalize_rating(9) is None

    def test_one_and_two_star_providers_fail_the_bar(self) -> None:
        """The operator does not want the cheapest plan from a 1-star REP."""
        assert not meets_rating_bar(1)
        assert not meets_rating_bar(2)

    def test_three_stars_and_up_pass(self) -> None:
        assert meets_rating_bar(3)
        assert meets_rating_bar(5)

    def test_unrated_fails_the_bar(self) -> None:
        """Unrated is not badly rated, but it is not a basis to move an account."""
        assert not meets_rating_bar(None)


class TestSavingsAndSwitchCost:
    def test_saving_is_computed_at_the_reference_usage(self) -> None:
        """15.66¢ -> 10.50¢ over 12,000 kWh/yr is $619.20."""
        assert annual_saving_cents(Decimal("15.66"), Decimal("10.50")) == 61920

    def test_a_worse_offer_yields_a_negative_saving(self) -> None:
        assert annual_saving_cents(Decimal("10.0"), Decimal("12.0")) == -24000

    def test_a_flat_fee_is_the_whole_cost(self) -> None:
        assert switch_cost_cents(
            15000, is_per_remaining_month=False, months_remaining=6,
        ) == 15000

    def test_a_per_month_fee_multiplies_by_the_term_left(self) -> None:
        assert switch_cost_cents(
            2000, is_per_remaining_month=True, months_remaining=6,
        ) == 12000

    def test_unknown_cost_stays_unknown(self) -> None:
        """A per-month fee with no term left to multiply must not read as free."""
        assert switch_cost_cents(
            2000, is_per_remaining_month=True, months_remaining=None,
        ) is None
        assert switch_cost_cents(
            None, is_per_remaining_month=False, months_remaining=6,
        ) is None


class TestCleanSpecialTerms:
    """The one place a time-of-use plan states its free window in words."""

    def test_champion_free_weekends_survives_intact(self) -> None:
        """143 characters — under the cap, so nothing is touched."""
        raw = (
            "Free power from 12 midnight Friday night to 11:59 PM Sunday "
            "night. No monthly fee or minimum usage requirement. Indexed "
            "Solar Buyback Included."
        )
        assert clean_special_terms(raw) == raw

    def test_pasted_whitespace_is_collapsed(self) -> None:
        """Some REPs paste a formatted paragraph; a ragged block is not copy."""
        assert clean_special_terms(
            "FREE electricity from 9:00 AM\n  to 4:00 PM\tdaily.",
        ) == "FREE electricity from 9:00 AM to 4:00 PM daily."

    def test_a_long_blurb_is_cut_at_a_word_boundary(self) -> None:
        """Chariot's 285-character marketing blurb is the real case."""
        raw = "word " * 100
        cleaned = clean_special_terms(raw)
        assert cleaned is not None
        assert cleaned.endswith("…")
        assert len(cleaned) <= MAX_SPECIAL_TERMS_CHARS + 1
        # No half-word before the ellipsis — a truncated token reads as
        # corrupted data rather than as an excerpt.
        assert cleaned[:-1].endswith("word")

    def test_nothing_published_is_none_not_empty(self) -> None:
        """The UI says so out loud, which it cannot do with an empty string."""
        assert clean_special_terms("") is None
        assert clean_special_terms("   ") is None
        assert clean_special_terms(None) is None
        assert clean_special_terms(42) is None


class TestDeriveZipCode:
    def test_reads_the_trailing_zip(self) -> None:
        assert derive_zip_code("6734 Peerless St, Houston, TX 77021") == "77021"

    def test_accepts_zip_plus_four(self) -> None:
        assert derive_zip_code("6734 Peerless St, Houston, TX 77021-1234") == "77021"

    def test_a_house_number_is_not_a_zip(self) -> None:
        """Anchoring to the end is what stops "67341 Main St" matching."""
        assert derive_zip_code("67341 Main St, Houston, TX") is None

    def test_missing_address_is_none(self) -> None:
        assert derive_zip_code(None) is None
        assert derive_zip_code("") is None


class TestFeedLoggingCarriesNoZip:
    """Application logs ship to Sentry — a property ZIP must never reach them.

    Checked against the module's AST rather than a captured record: the three
    warnings sit on separate failure branches that each need a differently
    broken feed to reach, and the property worth protecting is simply that no
    branch passes the ZIP to a logger.
    """

    def test_no_logger_call_takes_the_zip_as_an_argument(self) -> None:
        tree = ast.parse(inspect.getsource(power_to_choose_client))
        logger_calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "logger"
        ]
        assert logger_calls, "no logger calls found — this test would pass vacuously"

        for call in logger_calls:
            names = {
                sub.id for sub in ast.walk(call) if isinstance(sub, ast.Name)
            }
            assert "zip_code" not in names, ast.unparse(call)
