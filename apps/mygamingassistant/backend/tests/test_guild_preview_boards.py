"""The guild link-preview card's text and rankings: pure functions."""
from __future__ import annotations

import pytest

from app.services.wow.guild import guild_preview_boards as boards
from guild_preview_fixtures import make_guild, make_member


@pytest.mark.parametrize(
    ("value", "text"),
    [(0, "0"), (7, "7"), (1_234, "1,234"), (9_999, "9,999"), (10_000, "10k"), (12_400, "12.4k"), (12_449, "12.4k"), (123_456, "123.5k")],
)
def test_compact_numbers(value: int, text: str) -> None:
    assert boards.format_compact(value) == text


def test_ties_share_a_rank_and_read_by_name() -> None:
    members = [
        make_member("Cara", honorable_kills=50), make_member("Ana", honorable_kills=50),
        make_member("Bo", honorable_kills=90), make_member("Dee", honorable_kills=10),
    ]
    ranked = boards.rank_members(members, lambda m: m.honorable_kills)
    assert [(e.rank, e.name) for e in ranked] == [(1, "Bo"), (2, "Ana"), (2, "Cara"), (4, "Dee")]


def test_missing_and_zero_values_are_left_out_never_ranked_as_zero() -> None:
    members = [make_member("Ana", honorable_kills=None), make_member("Bo", honorable_kills=0), make_member("Cy", honorable_kills=3)]
    assert [e.name for e in boards.rank_members(members, lambda m: m.honorable_kills)] == ["Cy"]


def test_names_are_name_plus_surname_and_sort_ignores_case() -> None:
    members = [make_member("zed", "Z", dungeons_done=2), make_member("Amy", "B", dungeons_done=2)]
    assert [e.name for e in boards.rank_members(members, lambda m: m.dungeons_done)] == ["Amy B", "zed Z"]


def test_two_boards_show_the_top_three() -> None:
    members = [make_member(f"M{i}", honorable_kills=100 - i, dungeons_done=i + 1) for i in range(6)]
    result = boards.podium_boards(members)
    assert [b.title for b in result] == [boards.TITLE_HONORABLE_KILLS, boards.TITLE_DUNGEON_CLEARS]
    assert [len(b.entries) for b in result] == [3, 3]
    assert result[1].entries[0].name == "M5"


def test_an_empty_board_gives_way_to_highest_level() -> None:
    members = [make_member("Ana", level=60, honorable_kills=5), make_member("Bo", level=42, honorable_kills=3)]
    result = boards.podium_boards(members)
    assert [b.title for b in result] == [boards.TITLE_HONORABLE_KILLS, boards.TITLE_HIGHEST_LEVEL]
    assert result[1].entries[0].value == 60


def test_with_no_numbers_at_all_there_is_one_level_board_and_with_no_levels_none() -> None:
    members = [make_member("Ana", level=12), make_member("Bo", level=40)]
    assert [b.title for b in boards.podium_boards(members)] == [boards.TITLE_HIGHEST_LEVEL]
    assert boards.podium_boards([make_member("Ana", level=None)]) == []
    assert boards.podium_boards([]) == []


def test_subtitle_names_faction_members_and_how_many_are_at_the_cap() -> None:
    members = [make_member("A", level=60), make_member("B", level=60), make_member("C", level=33)]
    assert boards.subtitle(make_guild(members)) == "Alliance · 3 members · 2 at 60"


def test_subtitle_omits_the_cap_count_at_zero_and_pluralises_one_member() -> None:
    assert boards.subtitle(make_guild([make_member("A", level=10)], faction="horde")) == "Horde · 1 member"


def test_subtitle_omits_an_unknown_faction() -> None:
    assert boards.subtitle(make_guild([make_member("A", level=10)], faction="")) == "1 member"
