"""Pure-function tests for the lease renderer + computed-expression DSL.

These tests run without any database, storage, or HTTP machinery — they
cover only the substitution and parsing logic.
"""
from __future__ import annotations

import datetime as _dt

import pytest

from app.services.leases.computed import (
    ComputedExprError,
    evaluate,
    validate_expr,
)
from app.services.leases.placeholder_extractor import (
    extract_placeholder_keys,
    extract_placeholders_across_files,
    normalise_key,
)
from app.services.leases.renderer import SIGNATURE_LINE, render_md


# ---------------------------------------------------------------------------
# Renderer
# ---------------------------------------------------------------------------

class TestRenderMd:
    def test_simple_substitution(self) -> None:
        out = render_md(
            "Hello [TENANT FULL NAME], welcome.",
            {"TENANT FULL NAME": "Alice Smith"},
        )
        assert out == "Hello Alice Smith, welcome."

    def test_longest_key_first(self) -> None:
        """``[NUMBER OF DAYS]`` must substitute before ``[NUMBER]``."""
        text = "Length: [NUMBER OF DAYS] (was [NUMBER])"
        values = {"NUMBER OF DAYS": "365", "NUMBER": "5"}
        out = render_md(text, values)
        assert out == "Length: 365 (was 5)"

    def test_unknown_placeholder_left_intact(self) -> None:
        """Unfilled placeholders should remain bracketed for the host to spot."""
        out = render_md("Hi [TENANT FULL NAME] on [MOVE-IN DATE]", {"TENANT FULL NAME": "Bob"})
        assert "[MOVE-IN DATE]" in out
        assert "Bob" in out

    def test_none_value_renders_empty(self) -> None:
        out = render_md("Phone: [TENANT PHONE]", {"TENANT PHONE": None})
        assert out == "Phone: "

    def test_no_partial_bracket_match(self) -> None:
        """Bracketed substring of a longer placeholder must NOT match short key."""
        out = render_md(
            "[TENANT EMAIL] vs [EMAIL]",
            {"TENANT EMAIL": "alice@example.com", "EMAIL": "noreply@x.com"},
        )
        # Both should substitute correctly — TENANT EMAIL takes precedence
        # because longest-first ordering processes it before EMAIL.
        assert out == "alice@example.com vs noreply@x.com"

    def test_signature_placeholder_renders_blank_line_when_unset(self) -> None:
        """``[*SIGNATURE]`` keys absent from values get a blank signing line."""
        text = "Landlord: [LANDLORD SIGNATURE]\nTenant: [TENANT SIGNATURE]"
        out = render_md(text, {})
        assert "[LANDLORD SIGNATURE]" not in out
        assert "[TENANT SIGNATURE]" not in out
        assert SIGNATURE_LINE in out
        # Two signing lines, one per placeholder.
        assert out.count(SIGNATURE_LINE) == 2

    def test_signature_placeholder_value_wins_over_blank_line(self) -> None:
        """A caller-supplied signature value takes precedence over the blank-line default."""
        out = render_md(
            "Landlord: [LANDLORD SIGNATURE]",
            {"LANDLORD SIGNATURE": "/s/ Jason Kwon/"},
        )
        assert out == "Landlord: /s/ Jason Kwon/"
        assert SIGNATURE_LINE not in out

    def test_bare_date_renders_as_blank_line_when_unset(self) -> None:
        """``[DATE]`` next to a signature must render as a blank signing line."""
        out = render_md("Landlord: [LANDLORD SIGNATURE]  Date: [DATE]", {})
        assert "[DATE]" not in out
        # Two underscore lines: one for the signature, one for the date slot.
        assert out.count(SIGNATURE_LINE) == 2

    def test_bare_date_value_wins_over_blank_line(self) -> None:
        """A caller-supplied DATE value still wins over the blank-line default."""
        out = render_md("Date: [DATE]", {"DATE": "2026-05-30"})
        assert out == "Date: 2026-05-30"
        assert SIGNATURE_LINE not in out

    def test_effective_date_does_not_get_blank_line_treatment(self) -> None:
        """``[EFFECTIVE DATE]`` must NOT match the bare DATE blank-line rule."""
        out = render_md("Effective: [EFFECTIVE DATE]", {})
        assert "[EFFECTIVE DATE]" in out
        assert SIGNATURE_LINE not in out

    def test_duplicate_signature_placeholder_each_replaced(self) -> None:
        """Each occurrence of the same SIGNATURE key must be replaced — not just the first."""
        text = (
            "Landlord: [LANDLORD SIGNATURE] (initial here too: [LANDLORD SIGNATURE])"
            "\nAnd one more: [LANDLORD SIGNATURE]"
        )
        out = render_md(text, {})
        assert "[LANDLORD SIGNATURE]" not in out
        assert out.count(SIGNATURE_LINE) == 3


# ---------------------------------------------------------------------------
# Placeholder extractor
# ---------------------------------------------------------------------------

class TestPlaceholderExtractor:
    def test_basic_extraction(self) -> None:
        keys = extract_placeholder_keys(
            "Hello [TENANT FULL NAME], moving in on [MOVE-IN DATE].",
        )
        assert keys == ["TENANT FULL NAME", "MOVE-IN DATE"]

    def test_dedupes_within_text(self) -> None:
        keys = extract_placeholder_keys(
            "[TENANT FULL NAME] and again [TENANT FULL NAME]",
        )
        assert keys == ["TENANT FULL NAME"]

    def test_first_appearance_order(self) -> None:
        keys = extract_placeholder_keys("[B] [A] [C] [B]")
        assert keys == ["B", "A", "C"]

    def test_lowercase_text_in_brackets_skipped(self) -> None:
        # Free-text usage of brackets isn't captured.
        keys = extract_placeholder_keys("See [Note: addendum below]")
        assert keys == []

    def test_dedupes_across_files(self) -> None:
        keys = extract_placeholders_across_files([
            "[TENANT FULL NAME] [MOVE-IN DATE]",
            "[MOVE-IN DATE] [MOVE-OUT DATE]",
        ])
        assert keys == ["TENANT FULL NAME", "MOVE-IN DATE", "MOVE-OUT DATE"]

    def test_normalise_key_collapses_internal_whitespace(self) -> None:
        assert normalise_key("  TENANT   FULL   NAME  ") == "TENANT FULL NAME"


# ---------------------------------------------------------------------------
# Computed expression DSL
# ---------------------------------------------------------------------------

class TestComputedDsl:
    def test_today_evaluates(self) -> None:
        out = evaluate("today", {}, today=_dt.date(2026, 5, 2))
        assert out == "2026-05-02"

    def test_date_diff_days(self) -> None:
        out = evaluate(
            "(MOVE-OUT DATE - MOVE-IN DATE).days",
            {"MOVE-IN DATE": "2026-06-01", "MOVE-OUT DATE": "2026-12-01"},
        )
        assert out == "183"

    def test_date_diff_with_normalised_keys(self) -> None:
        # Whitespace-collapsed keys still resolve.
        out = evaluate(
            "(MOVE_OUT_DATE - MOVE_IN_DATE).days",
            {"MOVE_IN_DATE": "2026-01-01", "MOVE_OUT_DATE": "2026-01-08"},
        )
        assert out == "7"

    def test_concat(self) -> None:
        out = evaluate(
            "(FIRST + LAST)",
            {"FIRST": "Alice ", "LAST": "Smith"},
        )
        assert out == "Alice Smith"

    def test_validate_rejects_eval_style(self) -> None:
        """The DSL must reject anything that would be `eval()`-able."""
        with pytest.raises(ComputedExprError):
            validate_expr("__import__('os').system('rm -rf /')")
        with pytest.raises(ComputedExprError):
            validate_expr("os.system('whoami')")
        with pytest.raises(ComputedExprError):
            validate_expr("1+1")
        with pytest.raises(ComputedExprError):
            validate_expr("(MOVE-IN DATE - MOVE-OUT DATE).hours")  # only .days allowed
        with pytest.raises(ComputedExprError):
            validate_expr("")

    def test_evaluate_rejects_eval_payload(self) -> None:
        with pytest.raises(ComputedExprError):
            evaluate("__import__('os').system('whoami')", {})

    def test_evaluate_missing_value_raises(self) -> None:
        with pytest.raises(ComputedExprError):
            evaluate("(A - B).days", {"A": "2026-01-01"})

    def test_evaluate_invalid_iso_raises(self) -> None:
        with pytest.raises(ComputedExprError):
            evaluate("(A - B).days", {"A": "2026-01-01", "B": "not-a-date"})
