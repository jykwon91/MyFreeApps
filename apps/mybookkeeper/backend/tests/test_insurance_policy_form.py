"""The dwelling feed covers one policy form. Knowing which is which matters.

Telling an operator "no filings found under this carrier's name" about a
homeowners policy asserts a search that never happened — the dwelling dataset
could not have matched it under any carrier. These pin the reading, and pin the
deliberate bias: an unrecognised name is checked rather than ruled out, because
a missed increase costs more than a fruitless lookup.
"""
from __future__ import annotations

import pytest

from app.services.insurance._policy_form import (
    PolicyForm,
    is_out_of_scope,
    policy_form,
    strip_property_from_name,
)


@pytest.mark.parametrize(
    "name",
    [
        "Dwelling Fire DP-3, 6738 Peerless St, Houston, TX 77021",
        "DP-1 Basic Form",
        "dp 2 landlord",
        "Landlord dwelling policy",
    ],
)
def test_reads_the_dwelling_forms(name: str) -> None:
    assert policy_form(name) is PolicyForm.DWELLING_FIRE
    assert is_out_of_scope(policy_form(name)) is False


@pytest.mark.parametrize(
    "name",
    [
        "Homeowners Policy (HO-3) – 6734 Peerless St, Houston, TX 77021",
        "HO-5 Comprehensive",
        "ho8 modified coverage",
        "Homeowner's policy",
    ],
)
def test_reads_the_homeowners_forms(name: str) -> None:
    assert policy_form(name) is PolicyForm.HOMEOWNERS
    assert is_out_of_scope(policy_form(name)) is True


def test_form_code_beats_the_word() -> None:
    # Contradictory name; the code is the part that came off the dec page.
    assert policy_form("Homeowners Program DP-3") is PolicyForm.DWELLING_FIRE


def test_dp30_is_not_read_as_dp3() -> None:
    assert policy_form("Program DP-30") is PolicyForm.UNKNOWN


@pytest.mark.parametrize("name", ["", None, "Umbrella", "Flood policy"])
def test_unrecognised_names_are_checked_not_excluded(name: str | None) -> None:
    # The bias that matters: unknown is checked. Wrongly declaring a policy out
    # of scope hides a real increase; wrongly checking one merely finds nothing.
    form = policy_form(name)
    assert form is PolicyForm.UNKNOWN
    assert is_out_of_scope(form) is False


def test_both_words_and_no_code_stays_unknown() -> None:
    assert policy_form("Homeowners and dwelling package") is PolicyForm.UNKNOWN


class TestStripPropertyFromName:
    def test_removes_the_address_the_heading_already_shows(self) -> None:
        assert (
            strip_property_from_name(
                "Dwelling Fire DP-3, 6738 Peerless St, Houston, TX 77021",
                "6738 Peerless St, Houston, TX 77021",
            )
            == "Dwelling Fire DP-3"
        )

    def test_slices_the_original_not_the_normalised_string(self) -> None:
        # The bug this pins: normalising by DELETING punctuation shifts every
        # index past the first comma, so the slice cuts in the wrong place.
        assert (
            strip_property_from_name(
                "Dwelling Fire DP-3, 6738 Peerless St., Houston, TX 77021, renewal",
                "6738 Peerless St, Houston, TX 77021",
            )
            == "Dwelling Fire DP-3 renewal"
        )

    def test_leaves_a_name_that_does_not_contain_the_address(self) -> None:
        assert (
            strip_property_from_name("Dwelling Fire DP-3", "6738 Peerless St")
            == "Dwelling Fire DP-3"
        )

    def test_keeps_the_name_when_stripping_would_empty_it(self) -> None:
        assert (
            strip_property_from_name("6738 Peerless St", "6738 Peerless St")
            == "6738 Peerless St"
        )

    def test_no_property_name_is_a_no_op(self) -> None:
        assert strip_property_from_name("Dwelling DP-3", None) == "Dwelling DP-3"
