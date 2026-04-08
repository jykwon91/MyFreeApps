"""Tests for property_matcher_service — address matching logic."""
import uuid

import pytest

from app.models.properties.property import Property
from app.services.extraction.property_matcher_service import (
    match_property_id,
    _normalize,
    _split_combined_address,
    _extract_street_number,
    _token_overlap_ratio,
)


def _make_property(
    name: str = "Test Property",
    address: str | None = None,
) -> Property:
    prop = Property(id=uuid.uuid4(), name=name)
    if address:
        prop.address = address
    return prop


class TestNormalize:
    def test_lowercases(self) -> None:
        assert _normalize("ABC") == "abc"

    def test_strips_punctuation(self) -> None:
        assert _normalize("123 Main St.") == "123 main st"

    def test_strips_whitespace(self) -> None:
        assert _normalize("  123 Main  ") == "123 main"

    def test_empty(self) -> None:
        assert _normalize("") == ""

    def test_expands_street_to_st(self) -> None:
        assert _normalize("123 Main Street") == "123 main st"

    def test_expands_avenue_to_ave(self) -> None:
        assert _normalize("456 Oak Avenue") == "456 oak ave"

    def test_expands_drive_to_dr(self) -> None:
        assert _normalize("789 Elm Drive") == "789 elm dr"

    def test_expands_boulevard_to_blvd(self) -> None:
        assert _normalize("100 Grand Boulevard") == "100 grand blvd"

    def test_expands_road_to_rd(self) -> None:
        assert _normalize("200 Country Road") == "200 country rd"

    def test_expands_lane_to_ln(self) -> None:
        assert _normalize("300 Shady Lane") == "300 shady ln"

    def test_expands_direction_north(self) -> None:
        assert _normalize("100 North Main St") == "100 n main st"

    def test_expands_direction_south(self) -> None:
        assert _normalize("100 South Elm St") == "100 s elm st"

    def test_strips_zip_code(self) -> None:
        assert _normalize("123 Main St Houston TX 77021") == "123 main st houston tx"

    def test_strips_zip_plus_four(self) -> None:
        assert _normalize("123 Main St Houston TX 77021-1234") == "123 main st houston tx"

    def test_state_name_to_abbreviation(self) -> None:
        result = _normalize("123 Main St Houston Texas")
        assert result == "123 main st houston tx"

    def test_multi_word_state_name(self) -> None:
        result = _normalize("456 Broadway New York")
        assert result == "456 broadway ny"

    def test_commas_stripped(self) -> None:
        result = _normalize("6732 Peerless St, Houston, TX 77021")
        assert result == "6732 peerless st houston tx"

    def test_preserves_st_abbreviation(self) -> None:
        """'st' should stay 'st' — it's already the canonical form."""
        assert _normalize("123 Main St") == "123 main st"


class TestExtractStreetNumber:
    def test_extracts_leading_number(self) -> None:
        assert _extract_street_number("6732 peerless st") == "6732"

    def test_returns_none_for_no_number(self) -> None:
        assert _extract_street_number("peerless st") is None

    def test_returns_none_for_empty(self) -> None:
        assert _extract_street_number("") is None


class TestTokenOverlapRatio:
    def test_identical_tokens(self) -> None:
        tokens = ["6732", "peerless", "st", "houston", "tx"]
        assert _token_overlap_ratio(tokens, tokens) == 1.0

    def test_subset_tokens(self) -> None:
        short = ["6732", "peerless", "houston", "tx"]
        long = ["6732", "peerless", "st", "houston", "tx"]
        assert _token_overlap_ratio(short, long) == 1.0

    def test_partial_overlap(self) -> None:
        a = ["6732", "peerless", "st"]
        b = ["6732", "peerless", "ave"]
        # Overlap: 6732, peerless = 2 out of 3
        assert abs(_token_overlap_ratio(a, b) - 2 / 3) < 0.01

    def test_empty_tokens(self) -> None:
        assert _token_overlap_ratio([], ["a", "b"]) == 0.0
        assert _token_overlap_ratio(["a"], []) == 0.0


class TestMatchPropertyId:
    def test_exact_address_match(self) -> None:
        prop = _make_property(address="6738 Peerless St Houston TX")
        result = match_property_id("6738 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_case_insensitive_match(self) -> None:
        prop = _make_property(address="6738 Peerless St Houston TX")
        result = match_property_id("6738 peerless st houston tx", [prop])
        assert result == prop.id

    def test_partial_address_matches_by_prefix(self) -> None:
        prop = _make_property(address="6738 Peerless St Houston TX 77004")
        result = match_property_id("6738 Peerless St", [prop])
        assert result == prop.id

    def test_no_match_different_address(self) -> None:
        prop = _make_property(address="6738 Peerless St Houston TX")
        result = match_property_id("999 Other Ave Dallas TX", [prop])
        assert result is None

    def test_matches_by_name_when_no_address(self) -> None:
        prop = _make_property(name="6738 Peerless St")
        result = match_property_id("6738 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_first_match_wins(self) -> None:
        prop1 = _make_property(address="6738 Peerless St Houston TX")
        prop2 = _make_property(address="6738 Peerless St Houston TX")
        result = match_property_id("6738 Peerless St", [prop1, prop2])
        assert result == prop1.id

    def test_empty_address_returns_none(self) -> None:
        prop = _make_property(address="6738 Peerless St")
        result = match_property_id("", [prop])
        assert result is None

    def test_empty_properties_returns_none(self) -> None:
        result = match_property_id("6738 Peerless St", [])
        assert result is None

    def test_substring_match(self) -> None:
        prop = _make_property(address="6738 Peerless St Houston TX 77004")
        result = match_property_id("6738 Peerless", [prop])
        assert result == prop.id

    def test_punctuation_stripped_for_matching(self) -> None:
        prop = _make_property(address="6738 Peerless St., Houston, TX")
        result = match_property_id("6738 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_combined_slash_address_matches_first(self) -> None:
        prop = _make_property(address="6732 Peerless St Houston TX")
        result = match_property_id("6732/6734 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_combined_slash_address_matches_second(self) -> None:
        prop = _make_property(address="6734 Peerless St Houston TX")
        result = match_property_id("6732/6734 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_pipe_separated_address_matches(self) -> None:
        prop = _make_property(address="6732 Peerless St Houston TX")
        result = match_property_id("6732 Peerless St Houston TX | 6734 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_pipe_separated_matches_second(self) -> None:
        prop = _make_property(address="6734 Peerless St Houston TX")
        result = match_property_id("6732 Peerless St Houston TX | 6734 Peerless St Houston TX", [prop])
        assert result == prop.id

    # --- New: abbreviation normalization tests ---

    def test_street_vs_st_match(self) -> None:
        """'Street' and 'St' should normalize to the same form."""
        prop = _make_property(address="6732 Peerless St, Houston, TX")
        result = match_property_id("6732 Peerless Street, Houston, TX", [prop])
        assert result == prop.id

    def test_avenue_vs_ave_match(self) -> None:
        prop = _make_property(address="100 Oak Ave Houston TX")
        result = match_property_id("100 Oak Avenue Houston TX", [prop])
        assert result == prop.id

    def test_drive_vs_dr_match(self) -> None:
        prop = _make_property(address="200 Elm Dr Dallas TX")
        result = match_property_id("200 Elm Drive Dallas TX", [prop])
        assert result == prop.id

    def test_boulevard_vs_blvd_match(self) -> None:
        prop = _make_property(address="300 Grand Blvd Austin TX")
        result = match_property_id("300 Grand Boulevard Austin TX", [prop])
        assert result == prop.id

    # --- New: zip code stripping tests ---

    def test_zip_present_vs_absent(self) -> None:
        """Address with zip should match address without zip."""
        prop = _make_property(address="6732 Peerless St, Houston, TX 77021")
        result = match_property_id("6732 Peerless St Houston TX", [prop])
        assert result == prop.id

    def test_different_zips_still_match(self) -> None:
        """Two addresses differing only in zip should match."""
        prop = _make_property(address="6732 Peerless St Houston TX 77021")
        result = match_property_id("6732 Peerless St Houston TX 77004", [prop])
        assert result == prop.id

    # --- New: fuzzy matching (Tier 2) tests ---

    def test_fuzzy_match_missing_street_suffix(self) -> None:
        """The production bug case: 'Peerless Houston TX' vs 'Peerless St, Houston, TX 77021'."""
        prop = _make_property(address="6732 Peerless St, Houston, TX 77021")
        result = match_property_id("6732 Peerless Houston TX", [prop])
        assert result == prop.id

    def test_fuzzy_match_extra_words_in_extracted(self) -> None:
        """Extracted address has extra context that stored one doesn't."""
        prop = _make_property(address="6732 Peerless St Houston TX")
        result = match_property_id("6732 Peerless St Apt 4 Houston TX", [prop])
        assert result == prop.id

    def test_fuzzy_no_match_different_street_number(self) -> None:
        """Different street numbers should never fuzzy match."""
        prop = _make_property(address="6732 Peerless St Houston TX")
        result = match_property_id("6738 Peerless St Houston TX", [prop])
        assert result is None

    def test_fuzzy_no_match_completely_different_street(self) -> None:
        """Same street number but totally different street name shouldn't match."""
        prop = _make_property(address="100 Elm St Houston TX")
        result = match_property_id("100 Oak Ave Dallas TX", [prop])
        assert result is None

    def test_fuzzy_match_state_name_vs_abbreviation(self) -> None:
        """'Texas' should match 'TX' after normalization."""
        prop = _make_property(address="6732 Peerless St Houston TX")
        result = match_property_id("6732 Peerless St Houston Texas", [prop])
        assert result == prop.id

    def test_fuzzy_match_direction_abbreviation(self) -> None:
        """'North' vs 'N' should normalize the same."""
        prop = _make_property(address="100 N Main St Houston TX")
        result = match_property_id("100 North Main St Houston TX", [prop])
        assert result == prop.id

    def test_no_match_without_street_number(self) -> None:
        """Addresses without street numbers can't fuzzy match."""
        prop = _make_property(address="Peerless St Houston TX")
        result = match_property_id("Peerless Houston TX", [prop])
        # Falls through to Tier 1 substring — still matches because "peerless houston tx"
        # is a substring of "peerless st houston tx"... actually let's check
        # Tier 1 prefix: ["peerless", "houston", "tx"] vs ["peerless", "st", "houston", "tx"]
        # No prefix match. Substring: "peerless houston tx" in "peerless st houston tx"? No.
        # Tier 2: no street number -> None
        assert result is None

    def test_fuzzy_match_picks_best_ratio(self) -> None:
        """When multiple properties share the same street number, pick the best fuzzy match."""
        prop_a = _make_property(address="100 Elm St Houston TX")
        prop_b = _make_property(address="100 Oak Ave Dallas TX")
        # "100 Elm Houston TX" should match prop_a not prop_b
        result = match_property_id("100 Elm Houston TX", [prop_a, prop_b])
        assert result == prop_a.id


class TestSplitCombinedAddress:
    def test_plain_address_unchanged(self) -> None:
        assert _split_combined_address("6732 Peerless St") == ["6732 Peerless St"]

    def test_slash_split(self) -> None:
        result = _split_combined_address("6732/6734 Peerless St Houston TX")
        assert result == ["6732 Peerless St Houston TX", "6734 Peerless St Houston TX"]

    def test_pipe_split(self) -> None:
        result = _split_combined_address("123 Main St | 456 Oak Ave")
        assert result == ["123 Main St", "456 Oak Ave"]

    def test_slash_with_spaces(self) -> None:
        result = _split_combined_address("6732 / 6734 Peerless St")
        assert result == ["6732 Peerless St", "6734 Peerless St"]
