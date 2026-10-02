"""The create preview — ``/raid-admin create``'s private message — pure builders.

**Preview.**  The post's embed as it will look, under a line saying where
it goes and who it pings, then [Post raid] [More options] [Cancel].  The
post's sign-up buttons aren't shown: they're the same on every raid.

**More options** (type 7 over the preview).  The same embed, with a button
per thing to change — the forms, menus and notes switch Raid: Edit uses —
and [Mentions], the roles the raid pings.  Each change answers with this card
again, what changed on its first line, so the embed shows it straight
away.  [Back] goes up one level (a menu → this card → the preview);
changes are saved as they're made, so it never throws one away.  The
handlers are Raid: Edit's (``components/raid_edit.py``); they tell a draft
from a posted raid.
"""
from __future__ import annotations

from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_SECONDARY,
    BUTTON_STYLE_SUCCESS,
    COMPONENT_TYPE_ROLE_SELECT,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_copy, raid_draft_copy, raid_extras_copy, raid_limit_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_edit_views import notes_button
from app.services.discord.raid_extras_views import extras_button
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import action_row, button
from app.services.wow import raid_custom_id
from app.services.wow.raid_details import mention_roles
from app.services.wow.raid_embed import build_signup_embed
from app.services.wow.raid_limits import Limits

# The most roles one raid pings.
MENTION_MAX: Final = 5


def preview_data(
    event: WowRaidEvent, guild: WowRaidGuild, *, emojis: EmojiSet, notice: str | None = None
) -> dict[str, Any]:
    """The post's embed, then [Post raid] [More options] [Cancel]."""
    intro = raid_draft_copy.preview_intro(event.channel_id, mention_roles(event, guild))
    if notice:
        intro = f"{notice}\n\n{intro}"
    actions = action_row(
        _post_button(event),
        _draft_button(event, "More options", "more"),
        button("Cancel", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("discard", event.id)),
    )
    return ephemeral_data(intro, components=[actions], embeds=[_embed(event, guild, emojis)])


def options_data(
    event: WowRaidEvent, guild: WowRaidGuild, *, emojis: EmojiSet, notice: str | None = None
) -> dict[str, Any]:
    """More options: what changed (else the prompt), where it posts, the embed, a button per thing to change.

    The embed's role row shows any role limits; class limits, shown on the
    post's class buttons, get a line here while there are any.
    """
    lines = [
        notice or raid_copy.EDIT_PROMPT,
        raid_draft_copy.preview_state(event.channel_id, mention_roles(event, guild)),
        *raid_extras_copy.detail_lines(event),
    ]
    classes = Limits.of(event).classes
    if classes:
        lines.append(raid_limit_copy.class_limits_line(classes))
    rows = [
        action_row(
            _draft_button(event, "Title", "title"),
            _draft_button(event, "Leader", "leader"),
            _draft_button(event, "Date & Time", "when"),
            _draft_button(event, "Deadline", "deadline"),
        ),
        action_row(
            _draft_button(event, "Description", "desc"),
            _draft_button(event, "Image", "image"),
            _draft_button(event, "Color", "color"),
            extras_button(event),
        ),
        action_row(
            _draft_button(event, "Role limits", "role_limits"),
            _draft_button(event, "Class limits", "class_limits"),
            notes_button(event),
        ),
        # [Post raid] first, as on the preview, and never beside [Back].
        action_row(
            _post_button(event),
            _draft_button(event, "Mentions", "mentions"),
            _draft_button(event, "Back", "preview"),
        ),
    ]
    return ephemeral_data("\n".join(lines), components=rows, embeds=[_embed(event, guild, emojis)])


def mentions_picker(event: WowRaidEvent, guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """The roles the raid pings, up to ``MENTION_MAX``; [No ping] (or an emptied menu) for nobody."""
    current = mention_roles(event, guild)[:MENTION_MAX]
    select = {
        "type": COMPONENT_TYPE_ROLE_SELECT,
        "custom_id": raid_custom_id.encode("pick", event.id, "mentions"),
        "placeholder": raid_draft_copy.mentions_placeholder(MENTION_MAX),
        "min_values": 0,
        "max_values": MENTION_MAX,
        "default_values": [{"id": role_id, "type": "role"} for role_id in current],
    }
    no_ping = _draft_button(event, "No ping", "noping")
    if not current:
        no_ping["disabled"] = True  # it pings nobody already
    lines = [raid_line(event), raid_draft_copy.mentions_line(current), notice or raid_draft_copy.MENTIONS_PROMPT]
    rows = [action_row(select), action_row(no_ping, _draft_button(event, "Back", "back"))]
    return ephemeral_data("\n".join(lines), components=rows, embeds=[])


def _embed(event: WowRaidEvent, guild: WowRaidGuild, emojis: EmojiSet) -> dict[str, Any]:
    return build_signup_embed(event, [], guild, emojis=emojis)


def _post_button(event: WowRaidEvent) -> dict[str, Any]:
    return button("Post raid", BUTTON_STYLE_SUCCESS, raid_custom_id.encode("confirm", event.id))


def _draft_button(event: WowRaidEvent, label: str, action: str) -> dict[str, Any]:
    return button(label, BUTTON_STYLE_SECONDARY, raid_custom_id.encode("ed", event.id, action))
