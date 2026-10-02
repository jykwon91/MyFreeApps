"""Unit tests for app.services.wow.raid_post_fit — lengths without rendering."""
from __future__ import annotations

import pytest

from app.services.wow.raid_post_fit import FittedField, Lines, first_fits


@pytest.mark.parametrize("sep", ["\n", ", "])
@pytest.mark.parametrize("count", [0, 1, 2, 7])
def test_lines_length_matches_the_value_at_every_cap(sep: str, count: int) -> None:
    lines = Lines.of([f"name{i}" * (i + 1) for i in range(count)], sep)
    for cap in (None, *range(count + 2)):
        assert lines.length(cap) == len(lines.value(cap))


def test_lines_past_the_cap_become_more() -> None:
    lines = Lines.of(["Alice", "Bob", "Cy"], ", ")
    assert lines.value(None) == "Alice, Bob, Cy"
    assert lines.value(3) == "Alice, Bob, Cy"
    assert lines.value(1) == "Alice, +2 more"
    assert lines.value(0) == "+3 more"


def test_first_fits_falls_forward_to_the_next_level_that_fits() -> None:
    assert first_fits([9, 3, 8, 2, 7], 5) == [1, 1, 3, 3, 4]  # the last level stands, fit or not
    assert first_fits([], 5) == []


def test_a_fitted_field_shows_the_next_level_that_fits() -> None:
    rich = Lines.of(["x" * 10, "y" * 10], "\n")
    lean = Lines.of(["x", "y"], "\n")
    field = FittedField.of("Mage (2)", [(rich, None), (lean, None), (lean, 1)], limit=10, inline=True)
    assert field.field(0) == {"name": "Mage (2)", "value": "x\ny", "inline": True}
    assert field.length(0) == len("Mage (2)") + len("x\ny")
    assert field.field(2)["value"] == "x\n+1 more"


def test_a_fixed_field_reads_the_same_at_every_level() -> None:
    field = FittedField.fixed("Nobody yet", "Tanks · Mage", levels=3)
    assert [field.field(level) for level in range(3)] == [
        {"name": "Nobody yet", "value": "Tanks · Mage", "inline": False}
    ] * 3
    assert field.length(2) == len("Nobody yet") + len("Tanks · Mage")
