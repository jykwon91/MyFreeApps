"""Unit tests for character names — the rules (``raid_character``), the name a sign-up goes by
(``raid_text``) and the public raid post (``raid_embed``).

Pure: no DB, no Discord.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_character import CharacterNameError, clean_name, saved_name
from app.services.wow.raid_embed import EMBED_TOTAL_BUDGET, FIELD_VALUE_LIMIT, build_signup_message, embed_length
from app.services.wow.raid_text import same_name, shown_name, signed_name, told_apart, twin_names

_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


def _signup(
    name: str,
    *,
    character: str | None = None,
    status: str = "confirmed",
    wow_class: str | None = "mage",
    role: str | None = "dps",
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(10_000 + minute),
        display_name=name,
        character_name=character,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=None,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


# ---------------------------------------------------------------------------
# The rules
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("typed", "saved"),
    [
        ("thrallbot", "Thrallbot"),
        ("  THRALL ", "Thrall"),
        ("tHRALL", "Thrall"),
        ("Ab", "Ab"),  # the shortest
        ("abcdefghijkl", "Abcdefghijkl"),  # the longest
        ("éowyn", "Éowyn"),  # é as one character
        ("éowyn", "Éowyn"),  # é as e + accent: the same name
        ("тралл", "Тралл"),  # any alphabet
        ("", None),  # blank goes back to the Discord name
        ("  \t ", None),
    ],
)
def test_clean_name(typed: str, saved: str | None) -> None:
    assert clean_name(typed) == saved


@pytest.mark.parametrize(
    ("typed", "reason", "length"),
    [
        ("Thrall bot", "letters", 10),
        ("Thrall1", "letters", 7),
        ("Jaina-Proudmoore", "letters", 16),  # too long as well: letters are checked first
        ("<@123>", "letters", 6),
        ("Thrall\U0001f43a", "letters", 7),
        ("a.b/c", "letters", 5),
        ("T", "length", 1),
        ("abcdefghijklm", "length", 13),
        ("ßabcdefghijk", "length", 13),  # a leading ß capitalises to Ss
    ],
)
def test_clean_name_refuses_what_the_game_would(typed: str, reason: str, length: int) -> None:
    with pytest.raises(CharacterNameError) as refused:
        clean_name(typed)
    assert (refused.value.reason, refused.value.length) == (reason, length)


@pytest.mark.parametrize(
    ("names", "wow_class", "name"),
    [
        ({"shaman": "Thrallbot"}, "shaman", "Thrallbot"),
        ({"shaman": "thrallbot"}, "shaman", "Thrallbot"),
        ({"shaman": "Thrallbot"}, "mage", None),
        ({"necromancer": "Kel"}, "necromancer", None),  # not a class
        ({"shaman": 12}, "shaman", None),
        ({"shaman": "Thrall bot"}, "shaman", None),
        ({"shaman": "T"}, "shaman", None),
        ({"shaman": ""}, "shaman", None),
        ({}, "shaman", None),
        (None, "shaman", None),
        ({"shaman": "Thrallbot"}, None, None),
    ],
)
def test_saved_name_reads_junk_as_none(names: dict | None, wow_class: str | None, name: str | None) -> None:
    assert saved_name(names, wow_class) == name


# ---------------------------------------------------------------------------
# The name a sign-up goes by
# ---------------------------------------------------------------------------


def test_a_sign_up_goes_by_its_character_name_else_the_discord_name() -> None:
    assert shown_name(_signup("Jason", character="Thrallbot")) == "Thrallbot"
    assert shown_name(_signup("Jason")) == "Jason"
    assert same_name("Thrall", " thrall ")
    assert same_name("Big  Bob", "big bob")
    assert not same_name("Thrall", "Thrallbot")


def test_signed_name_says_who_plays_the_character() -> None:
    assert signed_name(_signup("Jason", character="Thrallbot")) == "Thrallbot / Jason"
    assert signed_name(_signup("jason", character="Jason")) == "Jason"  # the same name, said once
    assert signed_name(_signup("*Jay_")) == r"\*Jay\_"
    assert signed_name(_signup("*Jay*", character="Thrallbot")) == r"Thrallbot / \*Jay\*"
    assert signed_name(_signup("A" * 32, character="Thrallbot")) == "Thrallbot / " + "A" * 15 + "…"


def test_only_a_name_two_sign_ups_share_is_told_apart() -> None:
    jason = _signup("Jason", character="Thrall")
    thrall = _signup("thrall", minute=1)  # the Discord name is the one they go by
    tom = _signup("Tom", character="THRALL", minute=2)
    bob = _signup("Bob", character="Jaina", minute=3)

    twins = twin_names([jason, thrall, tom, bob])

    assert twins == frozenset({"thrall"})
    assert [told_apart(s, twins) for s in (jason, thrall, tom, bob)] == [" / Jason", "", " / Tom", ""]
    assert twin_names([jason, bob]) == frozenset()


# ---------------------------------------------------------------------------
# The public raid post
# ---------------------------------------------------------------------------


def _event() -> WowRaidEvent:
    return WowRaidEvent(
        id=uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000"),
        guild_id=uuid.uuid4(),
        raid_key="onyxia",
        starts_at=datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc),
        size_cap=40,
        status="scheduled",
        channel_id="c1",
        created_by_user_id="u0",
        created_by_display_name="Thrall",
        notes=None,
        cancel_reason=None,
        title=None,
    )


def _post(signups: list[WowRaidSignup]) -> dict:
    guild = WowRaidGuild(
        id=uuid.uuid4(), discord_guild_id="g1", raid_channel_id="c1", ping_role_id=None, timezone="America/New_York"
    )
    [embed] = build_signup_message(_event(), signups, guild, emojis=EMPTY_EMOJIS)["embeds"]
    assert embed_length(embed) <= EMBED_TOTAL_BUDGET
    assert all(len(field["value"]) <= FIELD_VALUE_LIMIT for field in embed["fields"])
    return embed


def _fields(embed: dict) -> dict[str, str]:
    return {field["name"]: field["value"] for field in embed["fields"]}


def _twelve_letters(i: int) -> str:
    return f"Q{chr(97 + i // 26)}{chr(97 + i % 26)}" + "x" * 9


def test_the_post_shows_the_character_name_instead_of_the_discord_name() -> None:
    signups = [
        _signup("Jason", character="Thrallbot", wow_class="warrior", role="tank"),
        _signup("Discord Bob", character="Jaina", status="tentative", minute=1),
        _signup("Discord Eve", character="Valeera", status="bench", wow_class="rogue", minute=2),
        _signup("Discord Dan", character="Malfurion", status="absence", wow_class="druid", minute=3),
        _signup("Plain Ann", status="late", wow_class="priest", role="healer", minute=4),
    ]

    embed = _post(signups)

    fields = _fields(embed)
    assert fields["Tanks (1)"] == "[WAR] `1` **Thrallbot**"
    assert fields["Priest (1)"] == "[PRI] `2` **Plain Ann** (late)"  # no character: the Discord name
    assert fields["Tentative (1)"] == "[MAG] Jaina"
    assert fields["Bench (1) · backups"] == "[ROG] Valeera"
    assert fields["Absence (1)"] == "[DRU] Malfurion"
    assert "Jason" not in json.dumps(embed) and "Discord" not in json.dumps(embed)


def test_a_column_of_forty_twelve_letter_names_keeps_every_name_whole() -> None:
    signups = [_signup(f"Discord{i:02d}", character=_twelve_letters(i), minute=i) for i in range(40)]

    mage = _fields(_post(signups))["Mage (40)"]

    # The order numbers go to make room; every name stays whole.
    assert mage.split("\n") == [f"[MAG] **{_twelve_letters(i)}**" for i in range(40)]


def test_a_crowded_post_trims_character_names_like_any_name() -> None:
    signups = [_signup(f"Discord{i:02d}", character=_twelve_letters(i), minute=i) for i in range(80)]

    mage = _fields(_post(signups))["Mage (80)"]

    # The leanest post cuts names at 9 characters, the ellipsis included.
    assert mage.split("\n")[:2] == ["**Qaaxxxxx…**", "**Qabxxxxx…**"]
    assert "Discord" not in mage
