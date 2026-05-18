"""Unit tests for the pure Airbnb-payout→property matcher.

All tests operate on pure functions — no DB or async fixtures. The
composite-key matrix (res_code present/absent/no-property; one/zero/many
listings; title collisions) is enumerated exhaustively per the
entity-matching test rule.
"""
import time
import uuid
from unittest.mock import MagicMock

from app.services.transactions.airbnb_payout_matcher import (
    decide_airbnb_attribution,
    parse_res_code,
)


def _make_listing(title: str | None, property_id: uuid.UUID | None) -> MagicMock:
    listing = MagicMock()
    listing.title = title
    listing.property_id = property_id
    return listing


# ---------------------------------------------------------------------------
# parse_res_code
# ---------------------------------------------------------------------------

class TestParseResCode:
    def test_none_input(self):
        assert parse_res_code(None) is None

    def test_empty_input(self):
        assert parse_res_code("") is None

    def test_hm_code_in_sentence(self):
        assert parse_res_code("Payout for reservation HM12345 is ready") == "HM12345"

    def test_hm_code_modern_10_char(self):
        assert parse_res_code("Your payout HMABCD1234 has arrived") == "HMABCD1234"

    def test_two_distinct_hm_codes_returns_none(self):
        # Adversarial / multi-reservation text → ambiguous → no auto.
        assert parse_res_code("codes HM11111AA and HM22222BB") is None

    def test_same_code_twice_is_one_distinct(self):
        assert parse_res_code("HM12345 ... reference HM12345 again") == "HM12345"

    def test_lowercase_hm_not_matched(self):
        # Real codes are uppercase; lowercase prose must not match.
        assert parse_res_code("the hm12345 thing") is None

    def test_anchored_non_hm_code(self):
        assert parse_res_code("confirmation code AB12CD34 enclosed") == "AB12CD34"

    def test_anchored_pure_digits_rejected(self):
        # A numeric run after "reservation" is an amount/id, not a code.
        assert parse_res_code("reservation 12345678 total") is None

    def test_anchored_prose_word_rejected(self):
        # Uppercase word with no digit after the anchor is not a code.
        assert parse_res_code("reservation SUMMARY follows") is None

    def test_hm_and_anchored_same_code_one_distinct(self):
        assert parse_res_code("reservation HM99887766") == "HM99887766"

    def test_code_beyond_scan_cap_not_found(self):
        assert parse_res_code("x" * 5000 + " HM12345") is None

    def test_no_code_present(self):
        assert parse_res_code("Airbnb payout deposited to your bank account") is None

    def test_anchored_regex_is_linear_no_redos(self):
        """Regression: a long whitespace run after an anchor word must not
        blow up (the bounded quantifiers make this O(n), not O(n^2))."""
        adversarial = "reservation " + " " * 4000
        start = time.perf_counter()
        result = parse_res_code(adversarial)
        elapsed = time.perf_counter() - start
        assert result is None
        assert elapsed < 0.05, f"parse_res_code took {elapsed:.3f}s — ReDoS regression"


# ---------------------------------------------------------------------------
# decide_airbnb_attribution
# ---------------------------------------------------------------------------

class TestDecideAirbnbAttribution:
    def test_res_code_property_auto(self):
        pid = uuid.uuid4()
        match = decide_airbnb_attribution(
            res_code_property_id=pid,
            airbnb_listings=[],
            txn_description=None,
            txn_address=None,
        )
        assert match == (pid, "auto")

    def test_res_code_outranks_lone_listing(self):
        """Regression guard (architecture Finding 2): a res_code-resolved
        property beats 'user happens to have one listing'."""
        res_pid = uuid.uuid4()
        other_pid = uuid.uuid4()
        match = decide_airbnb_attribution(
            res_code_property_id=res_pid,
            airbnb_listings=[_make_listing("Beach House", other_pid)],
            txn_description="Beach House payout",
            txn_address=None,
        )
        assert match == (res_pid, "auto")

    def test_single_listing_with_property_auto(self):
        pid = uuid.uuid4()
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=[_make_listing("Anything", pid)],
            txn_description=None,
            txn_address=None,
        )
        assert match == (pid, "auto")

    def test_single_listing_without_property_falls_through(self):
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=[_make_listing("Anything", None)],
            txn_description=None,
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_zero_listings_unmatched(self):
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=[],
            txn_description="Some payout text",
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_unique_title_in_description_proposes(self):
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        listings = [
            _make_listing("Lakeside Cabin", pid_a),
            _make_listing("Downtown Loft", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="Airbnb payout for Lakeside Cabin",
            txn_address=None,
        )
        assert match == (pid_a, "propose")

    def test_title_match_via_address(self):
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        listings = [
            _make_listing("Peerless Retreat", pid_a),
            _make_listing("Other Place", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description=None,
            txn_address="Peerless Retreat, 6738 Peerless St",
        )
        assert match == (pid_a, "propose")

    def test_two_titles_match_distinct_properties_unmatched(self):
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        listings = [
            _make_listing("Lakeside Cabin", pid_a),
            _make_listing("Downtown Loft", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="payout Lakeside Cabin and Downtown Loft",
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_two_titles_same_property_proposes(self):
        pid = uuid.uuid4()
        listings = [
            _make_listing("Lakeside Cabin", pid),
            _make_listing("Lakeside Cabin Suite", pid),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="payout for Lakeside Cabin Suite",
            txn_address=None,
        )
        assert match == (pid, "propose")

    def test_title_substring_collision_distinct_properties_unmatched(self):
        """'Loft' ⊂ 'Sky Loft' → both match → ambiguous → unmatched (never a
        wrong auto/propose)."""
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        listings = [
            _make_listing("Loft", pid_a),
            _make_listing("Sky Loft", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="payout for Sky Loft",
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_short_title_not_matched(self):
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        listings = [
            _make_listing("A1", pid_a),  # < min length, ignored
            _make_listing("Downtown Loft", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="payout A1 area",
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_none_title_skipped(self):
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        listings = [
            _make_listing(None, pid_a),
            _make_listing("Downtown Loft", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="a payout with no listing title in it",
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_matching_listing_without_property_skipped(self):
        pid_b = uuid.uuid4()
        listings = [
            _make_listing("Lakeside Cabin", None),  # title matches but no property
            _make_listing("Downtown Loft", pid_b),
        ]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="payout for Lakeside Cabin",
            txn_address=None,
        )
        assert match == (None, "unmatched")

    def test_single_listing_no_property_title_in_text_unmatched(self):
        """Lone listing, no property, its title in the payout text: tier 2
        falls through (no property) and tier 3 skips it (property guard) →
        unmatched, never a null-property propose."""
        listings = [_make_listing("Lakeside Cabin", None)]
        match = decide_airbnb_attribution(
            res_code_property_id=None,
            airbnb_listings=listings,
            txn_description="Airbnb payout for Lakeside Cabin",
            txn_address=None,
        )
        assert match == (None, "unmatched")
