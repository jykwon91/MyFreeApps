"""Raid: Edit → Advanced and /raid-admin advanced — the cards and the Minimum form (pure builders).

[Advanced] ends row 3 of Raid: Edit's card and of More options
(:func:`advanced_button`).  The card (:func:`advanced_card`) says each
setting — the raid's own, or the server's (tagged) — and its menu opens one:

* Minimum sign-ups — a form (:func:`minimum_modal`);
* Who can sign up — two role menus, who may join and who may not, then
  [Everyone can sign up] while an allowed list applies and [Use server
  default] while the raid has lists of its own (:func:`who_card`);
* Ready check — a menu of times, the server's first (:func:`ready_card`);
* Pin the post — [Pin it], [Don't pin] and the server's default, the raid's
  own choice lit; busy while the pin changes (:func:`pin_card`);
* Voice channel — a menu of the server's voice channels, then [No voice
  channel] and [Use server default] (:func:`voice_card`);
* Delete the post — a menu of delays after the raid (:func:`delete_card`).

A sub-card's [Back] is the Advanced card; the card's own [Back] is Raid:
Edit's ``back``, which shows the card it came from: More options for a
draft, Raid: Edit's card otherwise.  A notice (what just changed) ends a
card, small.

/raid-admin advanced shows the server's own values the same way
(:func:`server_card`), without the minimum and the delete (raid-only) or the
server-default choices (:func:`server_pin_card`, :func:`server_voice_card`);
its ids are ``raid:v1:sadv:…``.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_CHANNEL_SELECT,
    COMPONENT_TYPE_STRING_SELECT,
    TEXT_INPUT_STYLE_SHORT,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_advanced_copy, raid_post_options_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_forms import event_form, text_box
from app.services.discord.raid_views import action_row, button, role_menu
from app.services.wow import raid_advanced, raid_custom_id
from app.services.wow.raid_advanced import DELETE_CHOICES, INHERIT, KEEP, NO_VOICE, READY_CHOICES
from app.services.wow.raid_custom_id import NO_ARG

# The Minimum form's box: a raid has at most 40 seats.
MINIMUM_MAX: Final = 2
# The Voice channel menu's channels: voice (2) and stage (13).
_VOICE_TYPES: Final = (2, 13)


def advanced_button(event: WowRaidEvent) -> dict[str, Any]:
    """[Advanced] — opens the card."""
    return button(raid_advanced_copy.BUTTON, BUTTON_STYLE_SECONDARY, _id(event, "open"))


def advanced_card(event: WowRaidEvent, guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """The raid's settings, a line each, then a menu to change one and [Back]."""
    menu = _settings_menu(_id(event, "pick"), raid_advanced_copy.summaries(event, guild))
    back = button("Back", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("ed", event.id, "back"))
    lines = [raid_advanced_copy.title(event, guild), *raid_advanced_copy.setting_lines(event, guild)]
    return _card(lines, [action_row(menu), action_row(back)], notice)


def who_card(event: WowRaidEvent, guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """Who can sign up: the raid's own allowed and banned roles in two menus, then its buttons."""
    buttons: list[dict[str, Any]] = []
    if raid_advanced.signup_roles(event, guild).value:
        buttons.append(_button(event, raid_advanced_copy.EVERYONE_BUTTON, "all"))
    if event.signup_role_ids is not None or event.banned_role_ids is not None:
        buttons.append(_button(event, raid_advanced_copy.INHERIT_BUTTON, "inherit", "who"))
    buttons.append(_button(event, "Back", "open"))
    rows = _role_rows(
        _id(event, "allow"),
        _id(event, "ban"),
        raid_advanced.own_roles(event, guild, "signup"),
        raid_advanced.own_roles(event, guild, "banned"),
    )
    lines = [
        raid_advanced_copy.who_prompt(event, guild),
        *raid_advanced_copy.who_lines(event, guild),
        raid_advanced_copy.WHO_FOOTNOTE,
    ]
    return _card(lines, [*rows, action_row(*buttons)], notice)


def ready_card(event: WowRaidEvent, guild: WowRaidGuild) -> dict[str, Any]:
    """Ready check: the server's default first, then the times; the raid's own choice is picked."""
    own = event.ready_check_minutes
    server = raid_advanced_copy.ready_inherit_label(raid_advanced.server_ready_check(guild))
    options = [_option(server, INHERIT, default=own is None), *_ready_options(own)]
    menu = _select(_id(event, "ready"), raid_advanced_copy.READY_PLACEHOLDER, options)
    lines = [raid_advanced_copy.ready_prompt(event, guild), raid_advanced_copy.ready_line(event, guild)]
    return _card(lines, [action_row(menu), action_row(_button(event, "Back", "open"))], None)


def minimum_modal(event: WowRaidEvent) -> dict[str, Any]:
    """Minimum sign-ups: one box holding the raid's; empty = no minimum."""
    value = None
    if event.min_signups is not None:
        value = str(event.min_signups)
    field = text_box(
        raid_advanced_copy.MINIMUM_LABEL,
        raid_advanced_copy.MINIMUM_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=value,
        max_length=MINIMUM_MAX,
        required=False,
        placeholder=raid_advanced_copy.MINIMUM_PLACEHOLDER,
    )
    return event_form(event, "advmin", raid_advanced_copy.MINIMUM_TITLE, field)


def pin_card(
    event: WowRaidEvent, guild: WowRaidGuild, *, notice: str | None = None, busy: bool = False
) -> dict[str, Any]:
    """Pin the post: [Pin it], [Don't pin] and the server's default, the raid's own choice lit; all off while busy."""
    own = event.pin_post
    server = raid_post_options_copy.pin_inherit_label(bool(guild.pin_posts))
    buttons = [
        _lit(raid_post_options_copy.PIN_BUTTON, _id(event, "on", "pin"), own is True, busy),
        _lit(raid_post_options_copy.UNPIN_BUTTON, _id(event, "off", "pin"), own is False, busy),
        _lit(server, _id(event, "inherit", "pin"), own is None, busy),
        button("Back", BUTTON_STYLE_SECONDARY, _id(event, "open"), disabled=busy),
    ]
    lines = [
        raid_post_options_copy.pin_prompt(raid_advanced_copy.label(event, guild)),
        raid_post_options_copy.PIN_UNTIL,
        raid_advanced_copy.pin_line(event, guild),
    ]
    return _card(lines, [action_row(*buttons)], notice)


def voice_card(event: WowRaidEvent, guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """Voice channel: a menu holding the raid's own, then [No voice channel] and [Use server default], one lit."""
    own = event.voice_channel_id
    buttons = [
        _lit(raid_post_options_copy.NO_VOICE_BUTTON, _id(event, "off", "voice"), own == NO_VOICE),
        _lit(raid_advanced_copy.INHERIT_BUTTON, _id(event, "inherit", "voice"), own is None),
        _button(event, "Back", "open"),
    ]
    lines = [
        raid_post_options_copy.voice_prompt(raid_advanced_copy.label(event, guild)),
        raid_advanced_copy.voice_line(event, guild),
    ]
    return _card(lines, [action_row(_voice_menu(_id(event, "voice"), own)), action_row(*buttons)], notice)


def delete_card(event: WowRaidEvent, guild: WowRaidGuild) -> dict[str, Any]:
    """Delete the post: [Keep the post], then the delays after the raid; the raid's own choice is picked."""
    own = event.delete_post_after_hours
    options = [
        _option(raid_post_options_copy.KEEP_LABEL, KEEP, default=own is None),
        *(
            _option(raid_post_options_copy.delete_option(hours), str(hours), default=hours == own)
            for hours in DELETE_CHOICES
        ),
    ]
    menu = _select(_id(event, "del"), raid_post_options_copy.DELETE_PLACEHOLDER, options)
    lines = [
        raid_post_options_copy.delete_prompt(raid_advanced_copy.label(event, guild)),
        raid_post_options_copy.DELETE_STAYS,
        raid_post_options_copy.delete_value_line(own),
    ]
    return _card(lines, [action_row(menu), action_row(_button(event, "Back", "open"))], None)


def server_card(guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """/raid-admin advanced: the server's defaults, a line each, then a menu to change one."""
    menu = _settings_menu(_server_id("pick"), raid_advanced_copy.server_summaries(guild))
    lines = [
        raid_advanced_copy.SERVER_TITLE,
        raid_advanced_copy.SERVER_INTRO,
        *raid_advanced_copy.server_lines(guild),
        raid_advanced_copy.SERVER_FOOTNOTE,
    ]
    return _card(lines, [action_row(menu)], notice)


def server_who_card(guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """The server's allowed and banned roles in two menus; emptying one clears it."""
    rows = _role_rows(
        _server_id("allow"),
        _server_id("ban"),
        raid_advanced.server_roles(guild, "signup"),
        raid_advanced.server_roles(guild, "banned"),
    )
    lines = [
        raid_advanced_copy.SERVER_WHO_PROMPT,
        *raid_advanced_copy.server_who_lines(guild),
        raid_advanced_copy.WHO_FOOTNOTE,
    ]
    return _card(lines, [*rows, action_row(_server_back())], notice)


def server_ready_card(guild: WowRaidGuild) -> dict[str, Any]:
    """The server's ready check: the times, its own picked."""
    minutes = raid_advanced.server_ready_check(guild)
    menu = _select(_server_id("ready"), raid_advanced_copy.READY_PLACEHOLDER, _ready_options(minutes))
    lines = [raid_advanced_copy.SERVER_READY_PROMPT, raid_advanced_copy.server_ready_line(minutes)]
    return _card(lines, [action_row(menu), action_row(_server_back())], None)


def server_pin_card(guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """The server's Pin the post: [Pin raid posts] and [Don't pin], its own choice lit."""
    on = bool(guild.pin_posts)
    buttons = [
        _lit(raid_post_options_copy.SERVER_PIN_BUTTON, _server_id("on", "pin"), on),
        _lit(raid_post_options_copy.UNPIN_BUTTON, _server_id("off", "pin"), not on),
        _server_back(),
    ]
    lines = [
        raid_post_options_copy.SERVER_PIN_PROMPT,
        raid_post_options_copy.SERVER_PIN_NEEDS,
        raid_post_options_copy.pin_value_line(on),
    ]
    return _card(lines, [action_row(*buttons)], notice)


def server_voice_card(guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    """The server's voice channel: a menu holding it, then [No voice channel] (lit while there's none)."""
    channel_id = guild.voice_channel_id
    buttons = [
        _lit(raid_post_options_copy.NO_VOICE_BUTTON, _server_id("off", "voice"), channel_id is None),
        _server_back(),
    ]
    lines = [raid_post_options_copy.SERVER_VOICE_PROMPT, raid_post_options_copy.voice_value_line(channel_id)]
    return _card(lines, [action_row(_voice_menu(_server_id("voice"), channel_id)), action_row(*buttons)], notice)


def _card(lines: list[str], rows: list[dict[str, Any]], notice: str | None) -> dict[str, Any]:
    """The card's text, ending with the notice (small) when there is one."""
    if notice:
        lines = [*lines, f"-# {notice}"]
    return ephemeral_data("\n".join(lines), components=rows, embeds=[])


def _settings_menu(custom_id: str, summaries: list[tuple[str, str]]) -> dict[str, Any]:
    """The "Change a setting…" menu: an option per setting, its value in words underneath."""
    options = [_option(raid_advanced_copy.LABELS[key], key, description=summary) for key, summary in summaries]
    return _select(custom_id, raid_advanced_copy.PLACEHOLDER, options)


def _role_rows(allow_id: str, ban_id: str, allowed: Sequence[str], banned: Sequence[str]) -> list[dict[str, Any]]:
    """Who may join and who may not: a role menu each, holding *allowed* / *banned*."""
    return [
        action_row(role_menu(allow_id, raid_advanced_copy.ALLOW_PLACEHOLDER, allowed)),
        action_row(role_menu(ban_id, raid_advanced_copy.BAN_PLACEHOLDER, banned)),
    ]


def _ready_options(picked: int | None) -> list[dict[str, Any]]:
    """'Off', '15 minutes before' … '3 hours before'; *picked* is checked."""
    return [
        _option(raid_advanced_copy.ready_label(minutes), str(minutes), default=minutes == picked)
        for minutes in READY_CHOICES
    ]


def _lit(label: str, custom_id: str, picked: bool, busy: bool = False) -> dict[str, Any]:
    """A choice's button: the one in force stands out (and is greyed out); every one is off while busy."""
    style = BUTTON_STYLE_SECONDARY
    if picked:
        style = BUTTON_STYLE_PRIMARY
    return button(label, style, custom_id, disabled=picked or busy)


def _voice_menu(custom_id: str, channel_id: str | None) -> dict[str, Any]:
    """A menu of the server's voice and stage channels, *channel_id* checked (nothing for ``NO_VOICE``)."""
    picked: list[dict[str, str]] = []
    if channel_id is not None and channel_id != NO_VOICE:
        picked = [{"id": channel_id, "type": "channel"}]
    return {
        "type": COMPONENT_TYPE_CHANNEL_SELECT,
        "custom_id": custom_id,
        "placeholder": raid_post_options_copy.VOICE_PLACEHOLDER,
        "channel_types": list(_VOICE_TYPES),
        "min_values": 1,
        "max_values": 1,
        "default_values": picked,
    }


def _option(label: str, value: str, *, description: str | None = None, default: bool = False) -> dict[str, Any]:
    option: dict[str, Any] = {"label": label, "value": value}
    if description is not None:
        option["description"] = description
    if default:
        option["default"] = True
    return option


def _select(custom_id: str, placeholder: str, options: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": custom_id,
        "placeholder": placeholder,
        "min_values": 1,
        "max_values": 1,
        "options": options,
    }


def _button(event: WowRaidEvent, label: str, verb: str, arg: str = NO_ARG) -> dict[str, Any]:
    return button(label, BUTTON_STYLE_SECONDARY, _id(event, verb, arg))


def _server_back() -> dict[str, Any]:
    return button("Back", BUTTON_STYLE_SECONDARY, _server_id("open"))


def _id(event: WowRaidEvent, verb: str, arg: str = NO_ARG) -> str:
    return raid_custom_id.encode("adv", event.id, verb, arg)


def _server_id(verb: str, arg: str = NO_ARG) -> str:
    return raid_custom_id.encode("sadv", None, verb, arg)
