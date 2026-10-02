"""Unit tests for app.services.discord.raid_draft_views — the create preview.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from platform_shared.services.discord import COMPONENT_TYPE_ROLE_SELECT, EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_copy, raid_draft_copy
from app.services.discord.raid_draft_views import MENTION_MAX, mentions_picker, options_data, preview_data
from app.services.wow.raid_catalog import CLASSES
from app.services.wow.raid_embed import build_signup_embed

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_ICONS = EmojiSet(
    {cls.key: EmojiRef(str(1400000000000000000 + i), f"{cls.key}__a1b2c3") for i, cls in enumerate(CLASSES)}
)


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "discord_guild_id": "g1",
        "raid_channel_id": "c1",
        "ping_role_id": None,
        "timezone": "America/New_York",
    }
    fields.update(overrides)
    return WowRaidGuild(**fields)


def _draft(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "draft",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _buttons(row: dict) -> list[tuple[str, int, str]]:
    return [(b["label"], b["style"], b["custom_id"]) for b in row["components"]]


def _ed(action: str) -> str:
    return f"raid:v1:ed:{_EVENT_ID}:{action}"


_POST = ("Post raid", 3, f"raid:v1:confirm:{_EVENT_ID}")


# ---------------------------------------------------------------------------
# The preview
# ---------------------------------------------------------------------------


def test_preview_is_the_posts_embed_then_post_more_options_and_cancel() -> None:
    event = _draft()
    guild = _guild(ping_role_id="r9")

    data = preview_data(event, guild, emojis=_ICONS)

    assert data["content"] == (
        "**Preview.** This is how the raid will look in <#c1>, pinging <@&r9>. Does this look right?"
    )
    assert data["flags"] == 64  # only the organiser sees it
    assert data["allowed_mentions"] == {"parse": []}
    assert data["embeds"] == [build_signup_embed(event, [], guild, emojis=_ICONS)]
    # The post's sign-up buttons come with the post: they're the same on every raid.
    [actions] = data["components"]
    assert _buttons(actions) == [
        _POST,
        ("More options", 2, _ed("more")),
        ("Cancel", 2, f"raid:v1:discard:{_EVENT_ID}"),
    ]


def test_preview_puts_a_notice_above_the_intro_which_says_when_nobody_is_pinged() -> None:
    data = preview_data(_draft(), _guild(), emojis=EMPTY_EMOJIS, notice="Heads up.")
    assert data["content"] == (
        "Heads up.\n\n**Preview.** This is how the raid will look in <#c1>, with no ping. Does this look right?"
    )


def test_preview_names_the_roles_picked_for_the_raid_over_the_servers() -> None:
    guild = _guild(ping_role_id="r9")
    picked = preview_data(_draft(mention_role_ids=["r1", "r2", "r3"]), guild, emojis=EMPTY_EMOJIS)
    assert "in <#c1>, pinging <@&r1>, <@&r2> and <@&r3>. Does" in picked["content"]

    nobody = preview_data(_draft(mention_role_ids=[]), guild, emojis=EMPTY_EMOJIS)
    assert "in <#c1>, with no ping. Does" in nobody["content"]


# ---------------------------------------------------------------------------
# More options
# ---------------------------------------------------------------------------


def test_more_options_shows_the_post_and_a_button_per_thing_to_change() -> None:
    event = _draft()
    guild = _guild(ping_role_id="r9")

    data = options_data(event, guild, emojis=_ICONS)

    assert data["content"] == f"{raid_copy.EDIT_PROMPT}\n**Preview.** Posts in <#c1>, pinging <@&r9>."
    assert data["embeds"] == [build_signup_embed(event, [], guild, emojis=_ICONS)]
    first, second, limits, actions = data["components"]
    assert _buttons(first) == [("Title", 2, _ed("title")), ("Leader", 2, _ed("leader")), ("Date & Time", 2, _ed("when"))]
    assert _buttons(second) == [("Description", 2, _ed("desc")), ("Image", 2, _ed("image")), ("Color", 2, _ed("color"))]
    assert _buttons(limits)[:2] == [("Role limits", 2, _ed("role_limits")), ("Class limits", 2, _ed("class_limits"))]
    # [Post raid] first, as on the preview, and [Back] (to the preview) never beside it.
    assert _buttons(actions) == [_POST, ("Mentions", 2, _ed("mentions")), ("Back", 2, _ed("preview"))]


def test_more_options_says_what_changed_first_and_still_who_it_pings() -> None:
    data = options_data(_draft(mention_role_ids=[]), _guild(ping_role_id="r9"), emojis=EMPTY_EMOJIS, notice="Done.")
    assert data["content"] == "Done.\n**Preview.** Posts in <#c1>, with no ping."


def test_more_options_lists_class_limits_the_embed_cant_show() -> None:
    # Role limits are on the embed's role row; class limits show only on the
    # post's buttons, which the preview leaves out — so they get a line.
    event = _draft(class_limits={"rogue": 3}, role_limits={"tank": 2})
    data = options_data(event, _guild(), emojis=EMPTY_EMOJIS)
    assert data["content"].split("\n")[2:] == ["**Class limits:** Rogue 3"]
    assert options_data(_draft(role_limits={"tank": 2}), _guild(), emojis=EMPTY_EMOJIS)["content"].count("\n") == 1


# ---------------------------------------------------------------------------
# Mentions
# ---------------------------------------------------------------------------


def test_mentions_is_a_role_menu_holding_who_the_raid_pings_now() -> None:
    data = mentions_picker(_draft(), _guild(ping_role_id="r9"))

    select_row, buttons_row = data["components"]
    [select] = select_row["components"]
    assert select["type"] == COMPONENT_TYPE_ROLE_SELECT
    assert select["custom_id"] == f"raid:v1:pick:{_EVENT_ID}:mentions"
    assert select["placeholder"] == f"Pick up to {MENTION_MAX} roles to ping"
    assert (select["min_values"], select["max_values"]) == (0, MENTION_MAX)
    assert select["default_values"] == [{"id": "r9", "type": "role"}]
    assert _buttons(buttons_row) == [("No ping", 2, _ed("noping")), ("Back", 2, _ed("back"))]
    assert not any(button.get("disabled") for button in buttons_row["components"])
    assert data["content"].split("\n")[1:] == ["**Mentions:** <@&r9>", raid_draft_copy.MENTIONS_PROMPT]
    assert data["embeds"] == []


def test_mentions_starts_empty_with_no_ping_greyed_when_the_raid_pings_nobody() -> None:
    data = mentions_picker(_draft(mention_role_ids=[]), _guild(ping_role_id="r9"), notice="Pick again.")

    select_row, buttons_row = data["components"]
    [select] = select_row["components"]
    assert select["default_values"] == []
    no_ping, back = buttons_row["components"]
    assert no_ping["disabled"] is True
    assert "disabled" not in back
    assert data["content"].split("\n")[1:] == ["**Mentions:** *none*", "Pick again."]


# ---------------------------------------------------------------------------
# Copy
# ---------------------------------------------------------------------------


def test_roles_read_as_a_list_in_a_sentence() -> None:
    assert raid_draft_copy.role_list(["r1"]) == "<@&r1>"
    assert raid_draft_copy.role_list(["r1", "r2"]) == "<@&r1> and <@&r2>"
    assert raid_draft_copy.role_list(["r1", "r2", "r3"]) == "<@&r1>, <@&r2> and <@&r3>"


def test_roles_left_out_or_that_may_not_ping_are_named_as_it_or_them() -> None:
    assert raid_draft_copy.mentions_left_out(["r1"]).startswith(
        "I left out <@&r1> because it isn't mentionable and you can't ping it yourself."
    )
    assert raid_draft_copy.mentions_left_out(["r1", "r2"]).startswith(
        "I left out <@&r1> and <@&r2> because they aren't mentionable and you can't ping them yourself."
    )
    assert raid_draft_copy.mentions_heads_up(["r1"]).startswith(
        "Heads up: <@&r1> isn't mentionable, so I may not be able to ping it."
    )
    assert raid_draft_copy.mentions_heads_up(["r1", "r2"]).startswith(
        "Heads up: <@&r1> and <@&r2> aren't mentionable, so I may not be able to ping them."
    )
