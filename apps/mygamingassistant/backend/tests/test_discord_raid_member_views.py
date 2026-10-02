"""Unit tests for My sign-up — the private card a member opens from the raid post — and the names around it.

Pure: no DB, no Discord.  The card and its Character name form
(``raid_member_views``), what they say (``raid_member_copy``), and the other
private surfaces that show a character name: the Full roster, Raid: Signed,
the leader's player card and the /raid prefs card.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_copy, raid_member_copy
from app.services.discord.raid_leader_views import signed_data
from app.services.discord.raid_manage_views import Target, player_data
from app.services.discord.raid_member_views import character_form, my_signup_data
from app.services.discord.raid_views import prefs_data, roster_data
from app.services.wow import raid_custom_id

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
        "notes": None,
        "cancel_reason": None,
        "title": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _guild() -> WowRaidGuild:
    return WowRaidGuild(
        id=uuid.uuid4(), discord_guild_id="g1", raid_channel_id="c1", ping_role_id=None, timezone="America/New_York"
    )


def _signup(
    name: str,
    *,
    character: str | None = None,
    status: str = "confirmed",
    wow_class: str | None = "mage",
    role: str | None = "dps",
    spec: str | None = "frost",
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=str(200_000_000_000_000_000 + minute),
        display_name=name,
        character_name=character,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _pref(**fields: object) -> WowRaidMemberPref:
    values: dict[str, object] = {
        "guild_id": uuid.uuid4(),
        "discord_user_id": "1",
        "default_wow_class": None,
        "default_role": None,
        "saved_specs": {},
        "character_names": {},
        "dm_opt_out": False,
    }
    values.update(fields)
    return WowRaidMemberPref(**values)


def _icons(*logical: str) -> EmojiSet:
    return EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(logical)})


def _rows(data: dict) -> list[list[tuple[str, str]]]:
    """Each row's buttons as (label, custom_id)."""
    return [[(button["label"], button["custom_id"]) for button in row["components"]] for row in data["components"]]


def _lines(data: dict) -> list[str]:
    return data["content"].split("\n")


# ---------------------------------------------------------------------------
# My sign-up card
# ---------------------------------------------------------------------------


_CARD_HEADING = f"**Your sign-up** · Onyxia's Lair · <t:{_STAMP}:F>"
_CHANGE = ("Change spec", f"raid:v1:change:{_EVENT_ID}")
_CHARACTER = ("Character name", f"raid:v1:card:{_EVENT_ID}:char")
_FULL_ROSTER = ("Full roster", f"raid:v1:card:{_EVENT_ID}:roster")
_NOT_SET = "Character: not set, so I show your Discord name."


def test_my_sign_up_in_the_queue_shows_the_place_in_line() -> None:
    seat = _signup("Seated", wow_class="warrior", role="tank", spec=None)
    first = _signup("First", status="queued", wow_class="rogue", spec=None, minute=5)
    me = _signup("Me", status="queued", minute=9)

    data = my_signup_data(_event(), me, [seat, first, me], emojis=EMPTY_EMOJIS)

    assert _lines(data) == [
        _CARD_HEADING,
        "Status: **#2 in the queue**",
        "Spec: [MAG] **Frost Mage**",
        _NOT_SET,
        raid_copy.QUEUE_MOVES_UP,
    ]
    assert data["flags"] == 64
    assert data["embeds"] == []  # a card swapped back from the roster drops the roster embed
    # What you can change, then [Full roster] on a row of its own.
    assert _rows(data) == [[_CHANGE, _CHARACTER], [_FULL_ROSTER]]


def test_my_sign_up_uses_icons_once_uploaded() -> None:
    icons = _icons("status_late", "mage_frost")
    me = _signup("Me", status="late")
    assert _lines(my_signup_data(_event(), me, [me], emojis=icons))[1:] == [
        f"Status: {icons.markup('status_late')} **Late**",
        f"Spec: {icons.markup('mage_frost')} **Frost Mage**",
        _NOT_SET,
    ]


@pytest.mark.parametrize(
    ("status", "status_line", "note"),
    [
        ("confirmed", "Status: **Signed up**", None),
        ("late", "Status: **Late**", None),
        ("tentative", "Status: **Tentative**", raid_copy.TENTATIVE_NOTE),
        ("bench", "Status: **On the bench**", raid_copy.BENCH_NOTE),
    ],
)
def test_my_sign_up_says_what_each_status_means(status: str, status_line: str, note: str | None) -> None:
    me = _signup("Me", status=status, character="Thrallbot")
    data = my_signup_data(_event(), me, [me], emojis=EMPTY_EMOJIS)
    expected = [_CARD_HEADING, status_line, "Spec: [MAG] **Frost Mage**", "Character: **Thrallbot**"]
    if note is not None:
        expected.append(note)
    assert _lines(data) == expected
    assert _rows(data) == [[_CHANGE, _CHARACTER], [_FULL_ROSTER]]


def test_my_sign_up_puts_what_the_last_tap_did_on_top() -> None:
    me = _signup("Me", character="Thrallbot")
    notice = raid_member_copy.name_saved("Thrallbot", changed=True)
    assert _lines(my_signup_data(_event(), me, [me], emojis=EMPTY_EMOJIS, notice=notice))[:2] == [notice, _CARD_HEADING]
    data = my_signup_data(_event(), None, [], emojis=EMPTY_EMOJIS, notice=raid_copy.NOT_FOUND)
    assert _lines(data) == [raid_copy.NOT_FOUND, raid_copy.NOT_SIGNED_UP]


def test_my_sign_up_when_absent_has_no_spec_or_name_to_change() -> None:
    me = _signup("Me", status="absence", character="Thrallbot")
    data = my_signup_data(_event(), me, [me], emojis=EMPTY_EMOJIS)
    assert _lines(data) == [_CARD_HEADING, "Status: **Absent**"]
    assert _rows(data) == [[_FULL_ROSTER]]  # never an empty row


def test_my_sign_up_without_a_class_offers_change_but_no_name() -> None:
    me = _signup("Me", wow_class=None, role=None, spec=None)
    data = my_signup_data(_event(title="Ony *speedrun*"), me, [me], emojis=EMPTY_EMOJIS)
    assert _lines(data) == [rf"**Your sign-up** · Ony \*speedrun\* · <t:{_STAMP}:F>", "Status: **Signed up**"]
    assert _rows(data) == [[_CHANGE], [_FULL_ROSTER]]


def test_my_sign_up_when_not_signed_up() -> None:
    data = my_signup_data(_event(), None, [], emojis=EMPTY_EMOJIS)
    assert data["content"] == raid_copy.NOT_SIGNED_UP
    assert data["embeds"] == []
    assert _rows(data) == [[_FULL_ROSTER]]


def test_my_sign_up_once_sign_ups_close_drops_change_spec_but_keeps_the_name() -> None:
    me = _signup("Me", status="tentative")
    data = my_signup_data(_event(closed_at=_T0), me, [me], emojis=EMPTY_EMOJIS)
    assert _lines(data) == [
        _CARD_HEADING,
        "Status: **Tentative**",
        "Spec: [MAG] **Frost Mage**",
        _NOT_SET,
        raid_copy.CLOSED,
    ]
    # A character name is still yours to change until the raid starts.
    assert _rows(data) == [[_CHARACTER], [_FULL_ROSTER]]
    assert my_signup_data(_event(closed_at=_T0), None, [], emojis=EMPTY_EMOJIS)["content"] == raid_copy.CLOSED


# ---------------------------------------------------------------------------
# The Character name form and what the card says after it
# ---------------------------------------------------------------------------


def test_the_character_form_holds_the_name_it_shows() -> None:
    form = character_form(_event(), "Thrallbot")

    assert form["type"] == 9
    assert form["data"]["custom_id"] == f"raid:v1:m:{_EVENT_ID}:char"
    assert form["data"]["title"] == "Your character name"
    [field] = form["data"]["components"]
    assert (field["label"], field["description"]) == (raid_member_copy.CHARACTER_LABEL, raid_member_copy.CHARACTER_HINT)
    box = field["component"]
    assert box == {
        "type": 4,
        "custom_id": "value",
        "style": 1,
        "max_length": 12,
        "required": False,  # an empty box goes back to the Discord name
        "value": "Thrallbot",
        "placeholder": "e.g. Thrallbot",
    }
    assert "value" not in character_form(_event(), None)["data"]["components"][0]["component"]


def test_the_card_and_form_fit_discords_limits() -> None:
    assert len(raid_member_copy.CHARACTER_TITLE) <= 45
    assert len(raid_member_copy.CHARACTER_LABEL) <= 45
    assert len(raid_member_copy.CHARACTER_BUTTON) <= 45
    assert len(raid_member_copy.CHARACTER_HINT) <= 100
    assert len(raid_member_copy.CHARACTER_PLACEHOLDER) <= 100
    for custom_id in (raid_custom_id.encode("card", _EVENT_ID, "char"), raid_custom_id.encode("m", _EVENT_ID, "char")):
        assert len(custom_id) <= raid_custom_id.MAX_CUSTOM_ID_LEN
        assert raid_custom_id.parse(custom_id) is not None


@pytest.mark.parametrize(
    ("name", "changed", "said"),
    [
        ("Thrallbot", True, "Saved. I'll show **Thrallbot** on your sign-ups."),
        ("Thrallbot", False, "That's already the name I'm showing."),
        (None, True, "Okay, I'll use your Discord name."),
        (None, False, "You haven't set a character name yet."),
    ],
)
def test_what_the_card_says_after_the_form(name: str | None, changed: bool, said: str) -> None:
    assert raid_member_copy.name_saved(name, changed) == said


def test_why_a_name_was_refused() -> None:
    assert raid_member_copy.name_refusal("letters", 10) == (
        "Character names use letters only, no spaces, numbers or symbols. Try again."
    )
    assert raid_member_copy.name_refusal("length", 13) == (
        "Character names are 2-12 letters, and that one has 13. Try again."
    )


def test_raid_prefs_says_which_class_a_name_is_for() -> None:
    assert raid_member_copy.prefs_named("Thrallbot", "Shaman") == (
        "Saved. I'll use **Thrallbot** for your Shaman sign-ups. "
        "On a raid you've already joined, tap **My sign-up**, then **Character name**."
    )
    assert raid_member_copy.prefs_named(None, "Shaman") == "Okay, I'll use your Discord name for your Shaman sign-ups."


# ---------------------------------------------------------------------------
# Other private surfaces
# ---------------------------------------------------------------------------


def _shared_name_roster() -> list[WowRaidSignup]:
    """Two sign-ups go by Thrall (one's character, one's Discord name); a third by Jaina."""
    return [
        _signup("Jason", character="Thrall", wow_class="shaman", role="healer", spec="restoration"),
        _signup("thrall", wow_class="warrior", role="tank", spec="protection", minute=1),
        _signup(
            "Aleksandra the Great Healer",
            character="Thrall",
            status="tentative",
            wow_class="priest",
            role="healer",
            spec="holy",
            minute=2,
        ),
        _signup("Bob", character="Jaina", status="bench", minute=3),
    ]


def test_full_roster_tells_apart_sign_ups_that_go_by_one_name() -> None:
    [embed] = roster_data(_event(), _shared_name_roster(), _guild(), emojis=EMPTY_EMOJIS)["embeds"]
    assert embed["description"].split("\n\n") == [
        "**Tanks (1)**\n[WAR] `2` **thrall**",  # their Discord name is the name they go by
        "**Shaman (1)**\n[SHA] `1` **Thrall** / Jason",
        "**Tentative (1)**\n[PRI] Thrall / Aleksandra the …",  # the Discord name is cut at 16
        "**Bench (1) · backups**\n[MAG] Jaina",  # nobody else is Jaina: the character alone
    ]


def test_raid_signed_shows_the_character_then_who_plays_it() -> None:
    signups = [*_shared_name_roster(), _signup("thrallbot", character="Thrallbot", minute=4)]
    [embed] = signed_data(_event(), signups, emojis=EMPTY_EMOJIS)["embeds"]
    assert embed["description"].split("\n\n")[1:] == [
        "**Tanks (1)**\nthrall (Protection Warrior)",
        "**Mage (1)**\nThrallbot (Frost)",  # the same name either way: said once
        "**Shaman (1)**\nThrall / Jason (Restoration)",
        "**Tentative (1)**\nThrall / Aleksandra the … (Holy Priest)",
        "**Bench (1) · backups**\nJaina / Bob (Frost Mage)",
    ]


def test_the_leaders_player_card_adds_the_character_name() -> None:
    bob = _signup("Bob", character="Jaina")
    card = player_data(_event(), Target(bob.discord_user_id, "Bob"), [bob], emojis=EMPTY_EMOJIS)
    assert card["embeds"][0]["description"].split("\n") == ["**Bob** is in as **Frost Mage**.", "Character: **Jaina**"]
    bob.character_name = None
    card = player_data(_event(), Target(bob.discord_user_id, "Bob"), [bob], emojis=EMPTY_EMOJIS)
    assert card["embeds"][0]["description"] == "**Bob** is in as **Frost Mage**."


def test_prefs_card_lists_the_character_names_in_class_order() -> None:
    names = {"shaman": "Thrallbot", "priest": "Aleksa", "rogue": "Not a name1", "necromancer": "Kel"}
    pref = _pref(
        default_wow_class="shaman", default_role="healer", saved_specs={"shaman": "restoration"}, character_names=names
    )
    assert _lines(prefs_data(pref)) == [
        "Signing up as: **Restoration Shaman**",
        "Characters: **Aleksa** (Priest), **Thrallbot** (Shaman)",  # what can't be read is left out
        "DM reminders: **on**",
        "Change these with `/raid prefs class: spec: character: dm_reminders:`.",
    ]
    assert not any(line.startswith("Characters:") for line in _lines(prefs_data(_pref())))
    assert not any(line.startswith("Characters:") for line in _lines(prefs_data(None)))
