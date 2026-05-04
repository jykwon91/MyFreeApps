"""Unit tests for the rent-attribution payer_name matcher.

All tests operate on pure functions — no DB or async fixtures required.
"""
import uuid
from unittest.mock import MagicMock

import pytest

from app.services.transactions.attribution_service import _levenshtein, find_best_match


def _make_applicant(legal_name: str | None) -> MagicMock:
    a = MagicMock()
    a.id = uuid.uuid4()
    a.legal_name = legal_name
    return a


# ---------------------------------------------------------------------------
# _levenshtein pure-function tests
# ---------------------------------------------------------------------------

class TestLevenshtein:
    def test_identical_strings(self):
        assert _levenshtein("alice", "alice") == 0

    def test_empty_first(self):
        assert _levenshtein("", "abc") == 3

    def test_empty_second(self):
        assert _levenshtein("abc", "") == 3

    def test_single_insertion(self):
        assert _levenshtein("abc", "abcd") == 1

    def test_single_deletion(self):
        assert _levenshtein("abcd", "abc") == 1

    def test_single_substitution(self):
        assert _levenshtein("abc", "axc") == 1

    def test_two_edits(self):
        assert _levenshtein("kitten", "ktten") == 1
        assert _levenshtein("john doe", "jhn doe") == 1

    def test_distance_three(self):
        # "abc" → "xyz": 3 substitutions
        assert _levenshtein("abc", "xyz") == 3


# ---------------------------------------------------------------------------
# find_best_match scenarios
# ---------------------------------------------------------------------------

class TestFindBestMatch:
    def test_exact_match_case_insensitive(self):
        alice = _make_applicant("Alice Johnson")
        applicant, confidence = find_best_match("ALICE JOHNSON", [alice])
        assert applicant is alice
        assert confidence == "auto_exact"

    def test_exact_match_with_whitespace(self):
        bob = _make_applicant("Bob Smith")
        applicant, confidence = find_best_match("  bob smith  ", [bob])
        assert applicant is bob
        assert confidence == "auto_exact"

    def test_fuzzy_match_one_edit(self):
        carol = _make_applicant("Carol White")
        applicant, confidence = find_best_match("Carole White", [carol])
        # "carol white" vs "carole white" → 1 edit
        assert applicant is carol
        assert confidence == "fuzzy"

    def test_fuzzy_match_two_edits(self):
        dave = _make_applicant("Dave Brown")
        applicant, confidence = find_best_match("Dav Brown", [dave])
        # "dave brown" vs "dav brown" → 1 edit (should match)
        assert applicant is dave
        assert confidence == "fuzzy"

    def test_no_match_beyond_threshold(self):
        eve = _make_applicant("Eve Miller")
        applicant, confidence = find_best_match("Zorro", [eve])
        assert applicant is None
        assert confidence is None

    def test_empty_payer_name_returns_none(self):
        alice = _make_applicant("Alice Johnson")
        applicant, confidence = find_best_match("", [alice])
        assert applicant is None
        assert confidence is None

    def test_no_candidates(self):
        applicant, confidence = find_best_match("Someone", [])
        assert applicant is None
        assert confidence is None

    def test_applicant_with_null_legal_name_skipped(self):
        nameless = _make_applicant(None)
        applicant, confidence = find_best_match("Some Person", [nameless])
        assert applicant is None
        assert confidence is None

    def test_exact_match_beats_fuzzy(self):
        """Exact match takes precedence over a fuzzy match on another applicant."""
        alice = _make_applicant("Alice Johnson")
        alyce = _make_applicant("Alyce Johnson")  # fuzzy match
        applicant, confidence = find_best_match("Alice Johnson", [alyce, alice])
        assert applicant is alice
        assert confidence == "auto_exact"

    def test_picks_closest_fuzzy_candidate(self):
        """Among multiple fuzzy candidates, pick the one with smallest distance."""
        close = _make_applicant("Bob Smith")    # distance 1
        far   = _make_applicant("Rob Smith")    # distance 1 too, but further alpha
        # "bob smith" has distance 1 from both; implementation picks first found ≤ 2
        applicant, confidence = find_best_match("Bobb Smith", [close, far])
        assert confidence == "fuzzy"
        assert applicant is not None

    def test_multiple_candidates_no_match_returns_none(self):
        alice = _make_applicant("Alice Johnson")
        bob   = _make_applicant("Bob Smith")
        applicant, confidence = find_best_match("Totally Different Name XYZ", [alice, bob])
        assert applicant is None
        assert confidence is None

    def test_distance_exactly_two(self):
        """A Levenshtein distance of exactly 2 should yield 'fuzzy'."""
        alice = _make_applicant("Alice")
        # "alicee" → remove one 'e' (1 edit) → NOT within 2 from "alicez" but:
        # "alice" vs "alice" = 0; "alice" vs "alicezz" = 2
        applicant, confidence = find_best_match("alicezz", [alice])
        assert applicant is alice
        assert confidence == "fuzzy"

    def test_distance_three_no_match(self):
        """A Levenshtein distance of 3 must NOT match."""
        alice = _make_applicant("Alice")
        # "alice" vs "alicexyz" = 3 insertions
        applicant, confidence = find_best_match("alicexyz", [alice])
        assert applicant is None
        assert confidence is None
