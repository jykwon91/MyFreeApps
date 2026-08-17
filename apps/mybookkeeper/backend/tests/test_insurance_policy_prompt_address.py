"""The declarations-page prompt must say which of several addresses is the property.

A dec page names the insured location, the insured's mailing address, the
agent, the coverholder, and often a mortgagee. Only the first is the building.

The 2026 renewal for 6732 Peerless St names 6732 as the insured location and
6734 — the house next door, where the landlord lives — as the mailing address.
Read off the PDF text layer, where labels sit in one block and values in
another and the agent's ZIP runs straight into the next street number
("Houston, TX 770366734 Peerless St"), the model reported the policy as
6734 at confidence "high". Every other field was correct.

That is the failure worth guarding: not a blank field or a 422, but a
confident, well-formed policy filed against the wrong building. These tests
pin the instruction rather than the model — if a later edit drops the rule,
nothing else in the suite would notice, because the prompt is a string and the
behaviour it buys only shows up against a live document.
"""
from __future__ import annotations

import re

from app.services.extraction.prompts.insurance_policy_prompt import (
    INSURANCE_POLICY_PROMPT,
)

ADDRESS_SECTION_HEADING = "# Which address"


def _section(heading: str) -> str:
    """The prompt text under ``heading``, up to the next heading.

    Whitespace is collapsed: the prompt is hand-wrapped prose, so a phrase like
    "Location of Risk" can straddle a line break. Asserting on the wrapping
    would fail the next time a sentence is reworded, which is not the thing
    worth protecting.
    """
    start = INSURANCE_POLICY_PROMPT.index(heading)
    rest = INSURANCE_POLICY_PROMPT[start + len(heading):]
    end = rest.find("\n# ")
    return re.sub(r"\s+", " ", rest if end == -1 else rest[:end])


class TestTheAddressSectionExists:
    def test_the_prompt_has_a_section_about_which_address_to_use(self) -> None:
        assert ADDRESS_SECTION_HEADING in INSURANCE_POLICY_PROMPT

    def test_naming_the_policy_points_at_that_section(self) -> None:
        # The address reaches the operator through policy_name, so the rule has
        # to be reachable from the instruction that writes it.
        naming = _section("# Naming the policy")
        assert "insured location" in naming.lower()


class TestWhichAddressToUse:
    def test_names_the_insured_location_as_the_one_to_use(self) -> None:
        section = _section(ADDRESS_SECTION_HEADING).lower()
        assert "insured location" in section

    def test_lists_the_labels_a_dec_page_actually_prints(self) -> None:
        section = _section(ADDRESS_SECTION_HEADING).lower()
        for label in ("location of risk", "described location", "covered property"):
            assert label in section, label


class TestWhichAddressesAreForbidden:
    def test_forbids_the_insured_mailing_address(self) -> None:
        # The one that actually fired. A landlord's mail goes to where they
        # live, which on a portfolio of nearby rentals is often the house next
        # door — so the wrong answer looks entirely plausible.
        section = _section(ADDRESS_SECTION_HEADING).lower()
        assert re.search(r"never use the insured mailing address", section)

    def test_forbids_the_intermediaries_addresses(self) -> None:
        section = _section(ADDRESS_SECTION_HEADING).lower()
        for party in ("agent", "mortgagee", "loss payee"):
            assert party in section, party


class TestReadingTheTextLayer:
    def test_warns_that_labels_and_values_arrive_in_separate_blocks(self) -> None:
        section = _section(ADDRESS_SECTION_HEADING).lower()
        assert "separate blocks" in section
        assert "position" in section

    def test_quotes_the_run_together_line_from_the_real_document(self) -> None:
        # Verbatim from the 2026 Peerless renewal's text layer. A worked
        # example of the trap beats a description of it.
        section = _section(ADDRESS_SECTION_HEADING)
        assert "Houston, TX 770366734 Peerless St" in section


class TestRefusingToGuess:
    def test_an_ambiguous_address_caps_confidence_below_high(self) -> None:
        section = _section(ADDRESS_SECTION_HEADING).lower()
        assert "medium" in section
        assert "confidence" in section

    def test_prefers_no_address_to_a_guessed_one(self) -> None:
        # Consistent with the prompt's governing rule: a missing value is null,
        # never an inference. An address that might be the property is worth
        # less than none, because nothing downstream shows it was a guess.
        section = _section(ADDRESS_SECTION_HEADING).lower()
        assert "use none of them" in section
