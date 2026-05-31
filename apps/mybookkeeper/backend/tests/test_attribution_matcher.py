"""Unit tests for the rent-attribution payer_name matcher.

All tests operate on pure functions — no DB or async fixtures required.
"""
import uuid
from unittest.mock import MagicMock

import pytest

from app.services.transactions.attribution_matcher import (
    _levenshtein,
    find_best_match,
    normalize_handle,
    resolve_alias,
)


def _make_applicant(legal_name: str | None) -> MagicMock:
    a = MagicMock()
    a.id = uuid.uuid4()
    a.legal_name = legal_name
    return a


def _make_alias(applicant_id: uuid.UUID, payer_handle: str = "") -> MagicMock:
    """A duck-typed PayerAlias row for resolve_alias (reads .applicant_id + .payer_handle)."""
    a = MagicMock()
    a.applicant_id = applicant_id
    a.payer_handle = payer_handle
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

    def test_multiple_exact_matches_are_ambiguous(self):
        """Two tenants sharing a name must NOT auto-attribute to the first."""
        prince_a = _make_applicant("Prince Kapoor")
        prince_b = _make_applicant("Prince Kapoor")
        applicant, confidence = find_best_match(
            "PRINCE KAPOOR", [prince_a, prince_b]
        )
        assert applicant is None
        assert confidence == "ambiguous"

    def test_single_exact_among_distinct_names_still_auto(self):
        """A lone exact match is unaffected by the ambiguity guard."""
        prince = _make_applicant("Prince Kapoor")
        tushar = _make_applicant("Tushar Mehta")
        applicant, confidence = find_best_match(
            "Prince Kapoor", [tushar, prince]
        )
        assert applicant is prince
        assert confidence == "auto_exact"

    def test_multiple_fuzzy_tied_at_best_distance_are_ambiguous(self):
        """Two fuzzy candidates at the same smallest distance ≤ 2 → ambiguous."""
        john = _make_applicant("John Doe")  # "jonn doe" vs "john doe" = 1
        jon = _make_applicant("Jon Doe")    # "jonn doe" vs "jon doe"  = 1
        applicant, confidence = find_best_match("Jonn Doe", [john, jon])
        assert applicant is None
        assert confidence == "ambiguous"

    def test_closest_fuzzy_beats_a_farther_fuzzy_no_ambiguity(self):
        """A strictly-closer fuzzy candidate is not a tie — it resolves."""
        bob = _make_applicant("Bob Smith")  # distance 1 from "Bobb Smith"
        rob = _make_applicant("Rob Smith")  # distance 2 from "Bobb Smith"
        applicant, confidence = find_best_match("Bobb Smith", [bob, rob])
        assert applicant is bob
        assert confidence == "fuzzy"

    def test_one_exact_one_fuzzy_resolves_to_exact_not_ambiguous(self):
        """Exact match short-circuits Pass 2 — a fuzzy near-name is not a tie."""
        alice = _make_applicant("Alice Johnson")
        alyce = _make_applicant("Alyce Johnson")  # fuzzy (distance 1)
        applicant, confidence = find_best_match(
            "Alice Johnson", [alyce, alice]
        )
        assert applicant is alice
        assert confidence == "auto_exact"


# ---------------------------------------------------------------------------
# normalize_handle
# ---------------------------------------------------------------------------

class TestNormalizeHandle:
    def test_lower_strips(self):
        assert normalize_handle("  JDoe@Gmail.com ") == "jdoe@gmail.com"
        assert normalize_handle("@John-Doe") == "@john-doe"

    def test_none_and_blank_become_empty_sentinel(self):
        assert normalize_handle(None) == ""
        assert normalize_handle("   ") == ""


# ---------------------------------------------------------------------------
# resolve_alias scenarios
# ---------------------------------------------------------------------------

class TestResolveAlias:
    def test_no_candidates_is_none_outcome(self):
        applicant_id, outcome = resolve_alias([], "anything")
        assert applicant_id is None
        assert outcome == "none"

    def test_single_alias_auto_attributes(self):
        a = uuid.uuid4()
        applicant_id, outcome = resolve_alias([_make_alias(a)], None)
        assert applicant_id == a
        assert outcome == "alias"

    def test_two_aliases_same_tenant_is_unambiguous(self):
        """Same name learned twice for the SAME tenant (e.g. with + without a
        handle) still resolves — one distinct target."""
        a = uuid.uuid4()
        candidates = [_make_alias(a, ""), _make_alias(a, "a@x.com")]
        applicant_id, outcome = resolve_alias(candidates, None)
        assert applicant_id == a
        assert outcome == "alias"

    def test_name_to_two_tenants_no_handle_is_ambiguous(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        candidates = [_make_alias(a), _make_alias(b)]
        applicant_id, outcome = resolve_alias(candidates, None)
        assert applicant_id is None
        assert outcome == "ambiguous"

    def test_handle_disambiguates_same_name_two_people(self):
        """Two different people share a name; the incoming handle picks one."""
        a, b = uuid.uuid4(), uuid.uuid4()
        candidates = [_make_alias(a, "john.a@x.com"), _make_alias(b, "john.b@x.com")]
        applicant_id, outcome = resolve_alias(candidates, "JOHN.B@X.COM")
        assert applicant_id == b
        assert outcome == "alias"

    def test_handle_present_but_unseen_falls_back_to_name_level(self):
        """An incoming handle that matches no alias falls back to name-level —
        a lone same-named tenant still resolves."""
        a = uuid.uuid4()
        candidates = [_make_alias(a, "")]  # learned without a handle
        applicant_id, outcome = resolve_alias(candidates, "new-handle@x.com")
        assert applicant_id == a
        assert outcome == "alias"

    def test_unseen_handle_two_tenants_is_ambiguous(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        candidates = [_make_alias(a, "x@x.com"), _make_alias(b, "y@y.com")]
        applicant_id, outcome = resolve_alias(candidates, "z@z.com")
        assert applicant_id is None
        assert outcome == "ambiguous"

    def test_same_handle_two_tenants_is_ambiguous(self):
        """Defensive: if the same handle somehow maps to two tenants, refuse."""
        a, b = uuid.uuid4(), uuid.uuid4()
        candidates = [_make_alias(a, "shared@x.com"), _make_alias(b, "shared@x.com")]
        applicant_id, outcome = resolve_alias(candidates, "shared@x.com")
        assert applicant_id is None
        assert outcome == "ambiguous"
