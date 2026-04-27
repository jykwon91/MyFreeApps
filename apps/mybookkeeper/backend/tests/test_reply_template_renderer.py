"""Pure-function tests for the reply-template renderer.

The renderer is the core of templated replies — every variable substitution
rule, the dog-disclosure auto-prepend, and sanitization rules live here.
"""
from __future__ import annotations

import datetime as _dt

import pytest

from app.services.inquiries.reply_template_renderer import render_template


def _render(
    *,
    template_subject: str = "Re: $listing",
    template_body: str = "Hi $name",
    inquirer_name: str | None = "Alice",
    inquirer_employer: str | None = "Memorial Hermann",
    listing_title: str | None = "Cozy MedCenter Room",
    listing_pets_on_premises: bool = False,
    listing_large_dog_disclosure: str | None = None,
    desired_start_date: _dt.date | None = _dt.date(2026, 6, 1),
    desired_end_date: _dt.date | None = _dt.date(2026, 8, 31),
    host_name: str = "Jason",
    host_phone: str | None = None,
) -> tuple[str, str]:
    return render_template(
        template_subject=template_subject,
        template_body=template_body,
        inquirer_name=inquirer_name,
        inquirer_employer=inquirer_employer,
        listing_title=listing_title,
        listing_pets_on_premises=listing_pets_on_premises,
        listing_large_dog_disclosure=listing_large_dog_disclosure,
        desired_start_date=desired_start_date,
        desired_end_date=desired_end_date,
        host_name=host_name,
        host_phone=host_phone,
    )


class TestVariableSubstitution:
    def test_substitutes_name(self) -> None:
        _, body = _render(template_body="Hi $name")
        assert body == "Hi Alice"

    def test_substitutes_listing(self) -> None:
        subject, _ = _render(template_subject="Re: $listing")
        assert subject == "Re: Cozy MedCenter Room"

    def test_substitutes_dates(self) -> None:
        _, body = _render(template_body="$dates work?")
        assert body == "Jun 1, 2026 to Aug 31, 2026 work?"

    def test_substitutes_start_date_alone(self) -> None:
        _, body = _render(template_body="from $start_date")
        assert body == "from Jun 1, 2026"

    def test_substitutes_end_date_alone(self) -> None:
        _, body = _render(template_body="until $end_date")
        assert body == "until Aug 31, 2026"

    def test_substitutes_employer(self) -> None:
        _, body = _render(template_body="$employer staff welcome")
        assert body == "Memorial Hermann staff welcome"

    def test_substitutes_host_name(self) -> None:
        _, body = _render(template_body="-- $host_name")
        assert body == "-- Jason"

    def test_host_name_substituted_before_name(self) -> None:
        """Longest-key-first rule: ``$host_name`` must NOT be partially eaten by
        the substitution for ``$name``."""
        _, body = _render(
            template_body="$name says hi to $host_name",
            inquirer_name="Bob",
            host_name="Carol",
        )
        assert body == "Bob says hi to Carol"

    def test_substitutes_phone_when_present(self) -> None:
        _, body = _render(template_body="Call $host_phone", host_phone="555-1234")
        assert body == "Call 555-1234"


class TestFallbacks:
    def test_missing_name_falls_back(self) -> None:
        _, body = _render(template_body="Hi $name", inquirer_name=None)
        assert body == "Hi there"

    def test_missing_listing_falls_back(self) -> None:
        subject, _ = _render(template_subject="Re: $listing", listing_title=None)
        assert subject == "Re: the room"

    def test_missing_dates_fall_back(self) -> None:
        _, body = _render(
            template_body="$dates",
            desired_start_date=None,
            desired_end_date=None,
        )
        assert body == "your requested dates"

    def test_missing_employer_substitutes_empty_string(self) -> None:
        _, body = _render(
            template_body="X$employerY", inquirer_employer=None,
        )
        assert body == "XY"

    def test_missing_phone_substitutes_empty_string(self) -> None:
        _, body = _render(template_body="(call $host_phone)", host_phone=None)
        assert body == "(call )"

    def test_partial_dates_renders_one_sided(self) -> None:
        _, body = _render(
            template_body="$dates",
            desired_start_date=_dt.date(2026, 9, 1),
            desired_end_date=None,
        )
        assert body == "starting Sep 1, 2026"


class TestDogDisclosure:
    def test_prepends_when_pets_and_disclosure(self) -> None:
        _, body = _render(
            template_body="Hi $name",
            listing_pets_on_premises=True,
            listing_large_dog_disclosure="I have a 90lb golden retriever",
        )
        assert body == "I have a 90lb golden retriever\n\nHi Alice"

    def test_no_prepend_when_no_pets(self) -> None:
        _, body = _render(
            template_body="Hi $name",
            listing_pets_on_premises=False,
            listing_large_dog_disclosure="I have a dog",
        )
        assert body == "Hi Alice"

    def test_no_prepend_when_disclosure_blank(self) -> None:
        _, body = _render(
            template_body="Hi $name",
            listing_pets_on_premises=True,
            listing_large_dog_disclosure="",
        )
        assert body == "Hi Alice"

    def test_no_prepend_when_disclosure_whitespace_only(self) -> None:
        _, body = _render(
            template_body="Hi $name",
            listing_pets_on_premises=True,
            listing_large_dog_disclosure="   \n  ",
        )
        assert body == "Hi Alice"

    def test_disclosure_does_not_affect_subject(self) -> None:
        subject, _ = _render(
            template_subject="Re: $listing",
            listing_pets_on_premises=True,
            listing_large_dog_disclosure="There is a dog",
        )
        assert subject == "Re: Cozy MedCenter Room"


class TestSanitization:
    def test_strips_leading_trailing_whitespace_from_name(self) -> None:
        _, body = _render(template_body="$name", inquirer_name="  Alice  ")
        assert body == "Alice"

    def test_caps_long_name_at_100_chars(self) -> None:
        long_name = "X" * 200
        _, body = _render(template_body="$name", inquirer_name=long_name)
        assert "$name" not in body
        # Output should contain only the truncated value, not the original.
        assert len(body) == 100

    def test_caps_long_employer_at_200_chars(self) -> None:
        long = "Y" * 500
        _, body = _render(template_body="$employer", inquirer_employer=long)
        assert len(body) == 200

    def test_caps_long_listing_title(self) -> None:
        long = "Z" * 500
        _, body = _render(template_body="$listing", listing_title=long)
        assert len(body) == 200

    def test_no_html_rendering(self) -> None:
        """Variables are inserted as plain text — never interpreted as HTML."""
        _, body = _render(
            template_body="Hi $name",
            inquirer_name="<script>alert('x')</script>",
        )
        # The raw text appears verbatim — no escaping, no execution.
        assert body == "Hi <script>alert('x')</script>"


class TestIdempotency:
    def test_template_with_no_variables_returns_unchanged(self) -> None:
        subject, body = _render(
            template_subject="No variables here",
            template_body="Plain text body",
        )
        assert subject == "No variables here"
        assert body == "Plain text body"

    def test_unknown_variable_left_intact(self) -> None:
        """A future variable like ``$rate`` that the renderer doesn't know
        about should pass through unchanged — not throw."""
        _, body = _render(template_body="Rate is $rate per month")
        assert body == "Rate is $rate per month"


class TestPydanticImport:
    """Sanity check — ensure the renderer module is importable as a side-effect
    free module (no side effects at import time)."""

    def test_import_does_not_raise(self) -> None:
        from app.services.inquiries import reply_template_renderer  # noqa: F401

    def test_render_template_function_signature(self) -> None:
        with pytest.raises(TypeError):
            render_template()  # type: ignore[call-arg]
