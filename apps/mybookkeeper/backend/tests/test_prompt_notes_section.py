"""Both document-reading prompts must describe the shape of ``notes``.

``notes`` is rendered to the operator verbatim, beside the fields, in the
document-draft reader. Every other key in these prompts is a value with a type;
this one is prose, and the prompt is the only thing that decides how it is
broken up.

Left undescribed it arrived as a single block. On the 2026 Peerless renewal
that was 2,172 characters carrying the fee itemisation, the arithmetic check
and an address ambiguity in one unbroken paragraph — rendered faithfully, and
unreadable. Asking for one subject per paragraph produced six on the same
document, and 5-9 across every declarations page tested.

These tests pin the instruction rather than the model. The prompt is a string:
if a later edit drops the paragraph rule nothing else in the suite would fail,
because the behaviour it buys only appears against a live document.

Two neighbouring rules were tried at the same time and are deliberately absent
from the prompts and from these tests — one forbidding duplication between
``notes`` and ``unrepresented``, one forbidding failed reads from being filed as
terms. Measured against four real declarations pages, neither changed the
output, and the first doubled the length of ``unrepresented``. Anything added
here should be measured the same way before it is kept.
"""
from __future__ import annotations

import re

import pytest

from app.services.extraction.prompts.insurance_policy_prompt import (
    INSURANCE_POLICY_PROMPT,
)
from app.services.extraction.prompts.utility_plan_prompt import UTILITY_PLAN_PROMPT

NOTES_SECTION_HEADING = "# notes"

BOTH_PROMPTS = pytest.mark.parametrize(
    "prompt",
    [
        pytest.param(INSURANCE_POLICY_PROMPT, id="insurance"),
        pytest.param(UTILITY_PLAN_PROMPT, id="utility"),
    ],
)


def _section(prompt: str, heading: str) -> str:
    """The prompt text under ``heading``, up to the next heading.

    Whitespace is collapsed: these prompts are hand-wrapped prose, so a phrase
    can straddle a line break. Asserting on the wrapping would fail the next
    time a sentence is reflowed, which is not the thing worth protecting.
    """
    start = prompt.index(heading)
    rest = prompt[start + len(heading):]
    end = rest.find("\n# ")
    return re.sub(r"\s+", " ", rest if end == -1 else rest[:end])


class TestTheNotesSectionExists:
    @BOTH_PROMPTS
    def test_the_prompt_has_a_section_about_notes(self, prompt: str) -> None:
        assert NOTES_SECTION_HEADING in prompt

    @BOTH_PROMPTS
    def test_notes_is_still_a_key_in_the_output_shape(self, prompt: str) -> None:
        # A section describing a key that no longer exists would be worse than
        # no section at all.
        assert '"notes": string | null' in prompt


class TestTheParagraphRule:
    @BOTH_PROMPTS
    def test_asks_for_paragraphs_separated_by_a_blank_line(self, prompt: str) -> None:
        section = _section(prompt, NOTES_SECTION_HEADING).lower()
        assert "short paragraphs" in section
        assert "blank line" in section

    @BOTH_PROMPTS
    def test_asks_for_one_subject_per_paragraph(self, prompt: str) -> None:
        # The load-bearing half. "Short paragraphs" alone leaves the model free
        # to break one subject across three; naming the subjects is what
        # produced the 1 -> 5-9 change.
        section = _section(prompt, NOTES_SECTION_HEADING).lower()
        assert "one subject each" in section

    @BOTH_PROMPTS
    def test_says_why_by_naming_the_failure(self, prompt: str) -> None:
        section = _section(prompt, NOTES_SECTION_HEADING).lower()
        assert "single unbroken block" in section


class TestNotesKnowsItIsDisplayed:
    @BOTH_PROMPTS
    def test_says_the_operator_sees_it_verbatim(self, prompt: str) -> None:
        # Without this the model has no reason to treat formatting as load
        # bearing — it reads like a scratch field for a downstream parser.
        section = _section(prompt, NOTES_SECTION_HEADING).lower()
        assert "exactly as you write it" in section

    @BOTH_PROMPTS
    def test_places_notes_beside_the_fields_not_instead_of_them(
        self, prompt: str
    ) -> None:
        section = _section(prompt, NOTES_SECTION_HEADING).lower()
        assert "beside the fields" in section


class TestWhatBelongsInNotes:
    def test_insurance_names_the_things_that_have_no_field(self) -> None:
        section = _section(INSURANCE_POLICY_PROMPT, NOTES_SECTION_HEADING).lower()
        for subject in ("carrier", "agency", "fees_and_taxes_cents", "arithmetic"):
            assert subject in section, subject

    def test_insurance_routes_the_address_ambiguity_here(self) -> None:
        # "Which address" tells the model to explain itself in notes when it
        # cannot tell which address is the property. That instruction is only
        # honoured if this section agrees the explanation belongs here.
        section = _section(INSURANCE_POLICY_PROMPT, NOTES_SECTION_HEADING).lower()
        assert "addresses" in section

    def test_utility_names_the_things_that_have_no_field(self) -> None:
        section = _section(UTILITY_PLAN_PROMPT, NOTES_SECTION_HEADING).lower()
        for subject in ("provider", "rep", "arithmetic"):
            assert subject in section, subject

    @BOTH_PROMPTS
    def test_keeps_stated_terms_out_of_notes(self, prompt: str) -> None:
        # The boundary against unrepresented is stated once, lightly. A
        # stronger two-way version was tried and reverted — see the module
        # docstring.
        section = _section(prompt, NOTES_SECTION_HEADING).lower()
        assert "unrepresented" in section
