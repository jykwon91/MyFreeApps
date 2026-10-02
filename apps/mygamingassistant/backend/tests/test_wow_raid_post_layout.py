"""Unit tests for app.services.wow.raid_post_layout — pure: columns, counts, letter tiles."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_catalog import POST_COLUMNS
from app.services.wow.raid_post_layout import (
    MAX_TILES,
    NO_CLASS_COLUMN,
    column_counts,
    column_of,
    post_columns,
    role_counts,
    tile_line,
    tile_words,
    with_status,
)

_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


def _signup(
    name: str,
    *,
    status: str = "confirmed",
    wow_class: str | None = "warrior",
    role: str | None = "tank",
    spec: str | None = None,
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(10_000 + minute),
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _names(signups: list[WowRaidSignup]) -> list[str]:
    return [signup.display_name for signup in signups]


def _tiles(*names: str) -> EmojiSet:
    return EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(names)})


_ALL_TILES = _tiles(
    *(f"tile_{char}" for char in "abcdefghijklmnopqrstuvwxyz0123456789"),
    *(f"tile_{name}" for name in ("apos", "dash", "amp", "excl", "qmark", "dot", "colon", "comma", "gap")),
)


# ---------------------------------------------------------------------------
# Columns
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wow_class", "role", "spec", "column"),
    [
        ("warrior", "tank", "protection", "tank"),
        ("warrior", "dps", "fury", "warrior"),
        ("druid", "tank", "feral-tank", "tank"),
        ("druid", "dps", "feral-damage", "druid"),
        ("paladin", "tank", None, "tank"),  # pre-spec: its default spec, Protection
        ("priest", "healer", None, "priest"),
        ("mage", None, None, "mage"),  # a class without a role still has its column
        (None, None, None, NO_CLASS_COLUMN),
    ],
)
def test_column_of(wow_class: str | None, role: str | None, spec: str | None, column: str) -> None:
    assert column_of(_signup("P", wow_class=wow_class, role=role, spec=spec)) == column


def test_columns_list_the_line_in_order_and_leave_the_rest_below() -> None:
    signups = [
        _signup("Late", status="late", wow_class="mage", role="dps", minute=3),
        _signup("Prot", minute=1),
        _signup("Queue", status="queued", wow_class="mage", role="dps", minute=5),
        _signup("Frost", wow_class="mage", role="dps", spec="frost", minute=2),
        _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=4),
        _signup("Bench", status="bench", wow_class="rogue", role="dps", minute=6),
        _signup("Away", status="absence", wow_class=None, role=None, minute=7),
    ]
    columns = post_columns(signups)
    # Every button's column, even when empty; no "No class yet" while nobody is in it.
    assert list(columns) == list(POST_COLUMNS)
    assert _names(columns["mage"]) == ["Frost", "Late", "Queue"]
    assert _names(columns["tank"]) == ["Prot"]
    assert columns["rogue"] == []
    assert column_counts(signups) == {**dict.fromkeys(POST_COLUMNS, 0), "tank": 1, "mage": 3}


def test_no_class_column_only_when_someone_on_the_line_is_in_it() -> None:
    assert NO_CLASS_COLUMN not in post_columns([_signup("Away", status="absence", wow_class=None, role=None)])
    columns = post_columns([_signup("Old", wow_class=None, role=None)])
    assert list(columns) == [*POST_COLUMNS, NO_CLASS_COLUMN]
    assert _names(columns[NO_CLASS_COLUMN]) == ["Old"]


def test_role_counts_count_seat_holders_by_display_role() -> None:
    signups = [
        _signup("Prot", minute=1),
        _signup("Fury", role="dps", spec="fury", minute=2),
        _signup("Hunter", status="late", wow_class="hunter", role="dps", minute=3),  # late still holds a seat
        _signup("Moonkin", wow_class="druid", role="dps", spec="balance", minute=4),  # casters are ranged
        _signup("Holy", wow_class="priest", role="healer", spec="holy", minute=5),
        _signup("Queue", status="queued", wow_class="mage", role="dps", minute=6),  # no seat yet
        _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=7),
        _signup("Old", wow_class=None, role=None, minute=8),  # a seat, but no role to count
    ]
    assert role_counts(signups) == {"tank": 1, "melee": 1, "ranged": 2, "healer": 1}
    assert role_counts([]) == {"tank": 0, "melee": 0, "ranged": 0, "healer": 0}


def test_with_status_keeps_line_order() -> None:
    signups = [
        _signup("B", status="bench", minute=2),
        _signup("A", status="bench", minute=1),
        _signup("C", minute=0),
    ]
    assert _names(with_status(signups, "bench")) == ["A", "B"]
    assert with_status(signups, "absence") == []


# ---------------------------------------------------------------------------
# Letter tiles
# ---------------------------------------------------------------------------


def test_tile_words_spell_letters_digits_and_punctuation() -> None:
    assert tile_words("Onyxia's Lair") == [
        ["tile_o", "tile_n", "tile_y", "tile_x", "tile_i", "tile_a", "tile_apos", "tile_s"],
        ["tile_l", "tile_a", "tile_i", "tile_r"],
    ]
    assert tile_words("MC-40!") == [["tile_m", "tile_c", "tile_dash", "tile_4", "tile_0", "tile_excl"]]
    # Typographic apostrophes, stray spaces and accents all fold to tiles we have.
    assert tile_words("  zul’gurub  ") == [
        ["tile_z", "tile_u", "tile_l", "tile_apos", "tile_g", "tile_u", "tile_r", "tile_u", "tile_b"]
    ]
    assert tile_words("Café") == [["tile_c", "tile_a", "tile_f", "tile_e"]]


def test_titles_tiles_cannot_spell_stay_plain_text() -> None:
    longest = "Temple of Ahn'Qiraj"
    assert len(longest) == MAX_TILES
    assert tile_words(longest) is not None
    assert tile_words(longest + "!") is None  # one tile too many
    assert tile_words("") is None
    assert tile_words("   ") is None
    assert tile_words("#1 raid") is None  # no tile for '#'
    assert tile_words("Ony *speedrun*") is None


def test_tile_line_joins_words_with_the_gap_tile() -> None:
    mark = _ALL_TILES.markup
    assert mark("tile_m") == "<:tile_m__a1b2c3:1400000000000000012>"
    assert tile_line("MC 40", _ALL_TILES) == (
        f"{mark('tile_m')}{mark('tile_c')} {mark('tile_gap')} {mark('tile_4')}{mark('tile_0')}"
    )


def test_tile_line_needs_every_tile_it_uses_uploaded() -> None:
    bwl = _tiles("tile_b", "tile_w", "tile_l")
    assert tile_line("BWL", bwl) == "".join(bwl.markup(f"tile_{char}") for char in "bwl")  # one word: no gap
    assert tile_line("B W L", bwl) is None  # more than one word needs the gap tile
    assert tile_line("BWL", _tiles("tile_b", "tile_w")) is None  # never half-tiled
    assert tile_line("MC 40", EMPTY_EMOJIS) is None
    assert tile_line("Ony *speedrun*", _ALL_TILES) is None
