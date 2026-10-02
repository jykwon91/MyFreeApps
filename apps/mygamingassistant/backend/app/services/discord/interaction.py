"""Typed view over a verified Discord interaction payload + response builders.

Handlers never index the raw payload directly — :class:`Interaction` parses
it once, defensively (every field may be missing on a malformed or
unexpected payload), and the ``*_response`` helpers build callback bodies
with an explicit ``allowed_mentions`` on every message.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Final

from platform_shared.services.discord import (
    CALLBACK_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
    CALLBACK_TYPE_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    CALLBACK_TYPE_MODAL,
    CALLBACK_TYPE_UPDATE_MESSAGE,
    MESSAGE_FLAG_EPHEMERAL,
    has_permission,
    parse_bitfield,
)

NO_MENTIONS: Final[dict[str, Any]] = {"parse": []}

# Option type for SUB_COMMAND — its nested ``options`` are the real inputs.
_OPTION_TYPE_SUB_COMMAND: Final = 1

# Snowflake IDs carry their creation time: ms since the Discord epoch
# (2015-01-01T00:00:00Z) in the bits above the low 22.
_DISCORD_EPOCH_MS: Final = 1_420_070_400_000
_SNOWFLAKE_TIME_SHIFT: Final = 22


@dataclass(frozen=True)
class Interaction:
    type: int
    application_id: str
    token: str
    guild_id: str | None
    channel_id: str | None
    user_id: str
    display_name: str
    member_permissions: int
    command_name: str = ""
    subcommand: str = ""
    options: dict[str, Any] = field(default_factory=dict)
    focused_option: str = ""
    custom_id: str = ""
    values: tuple[str, ...] = ()
    resolved: dict[str, Any] = field(default_factory=dict)
    # The message (or member) a context-menu command was used on.
    target_id: str = ""
    # A modal submit's text inputs: custom_id → what the member typed.
    fields: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Interaction":
        data = _as_dict(payload.get("data"))
        member = _as_dict(payload.get("member"))
        user = _as_dict(member.get("user")) or _as_dict(payload.get("user"))

        subcommand = ""
        option_list = _as_list(data.get("options"))
        if option_list and _as_dict(option_list[0]).get("type") == _OPTION_TYPE_SUB_COMMAND:
            subcommand = str(_as_dict(option_list[0]).get("name", ""))
            option_list = _as_list(_as_dict(option_list[0]).get("options"))
        options: dict[str, Any] = {}
        focused = ""
        for raw_option in option_list:
            option = _as_dict(raw_option)
            name = option.get("name")
            if not isinstance(name, str):
                continue
            options[name] = option.get("value")
            if option.get("focused"):
                focused = name

        return cls(
            type=int(payload.get("type") or 0),
            application_id=str(payload.get("application_id") or ""),
            token=str(payload.get("token") or ""),
            guild_id=_optional_str(payload.get("guild_id")),
            channel_id=_optional_str(payload.get("channel_id")),
            user_id=str(user.get("id") or ""),
            display_name=_display_name(member, user),
            member_permissions=parse_bitfield(member.get("permissions")),
            command_name=str(data.get("name") or ""),
            subcommand=subcommand,
            options=options,
            focused_option=focused,
            custom_id=str(data.get("custom_id") or ""),
            values=tuple(str(v) for v in _as_list(data.get("values"))),
            resolved=_as_dict(data.get("resolved")),
            target_id=str(data.get("target_id") or ""),
            fields=_modal_fields(data.get("components")),
        )

    def has_permission(self, permission: int) -> bool:
        """Server-side re-check of the invoking member's permission bitfield."""
        return has_permission(self.member_permissions, permission)

    def resolved_role(self, role_id: str) -> dict[str, Any]:
        return _as_dict(_as_dict(self.resolved.get("roles")).get(role_id))

    def str_option(self, name: str) -> str | None:
        value = self.options.get(name)
        if isinstance(value, str):
            return value
        return None

    def int_option(self, name: str) -> int | None:
        value = self.options.get(name)
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        return None

    def bool_option(self, name: str) -> bool | None:
        value = self.options.get(name)
        if isinstance(value, bool):
            return value
        return None


def snowflake_created_ms(snowflake: Any) -> int | None:
    """Unix time in ms when Discord created ``snowflake``; ``None`` if it isn't one."""
    if not isinstance(snowflake, str) or not snowflake.isdecimal():
        return None
    return (int(snowflake) >> _SNOWFLAKE_TIME_SHIFT) + _DISCORD_EPOCH_MS


# ---------------------------------------------------------------------------
# Response builders
# ---------------------------------------------------------------------------


def ephemeral_data(
    content: str,
    *,
    components: list[dict[str, Any]] | None = None,
    embeds: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Message body for an ephemeral message (also used for follow-ups / edits)."""
    data: dict[str, Any] = {
        "content": content,
        "flags": MESSAGE_FLAG_EPHEMERAL,
        "allowed_mentions": NO_MENTIONS,
        "components": components or [],
    }
    if embeds is not None:
        data["embeds"] = embeds
    return data


def ephemeral_response(
    content: str,
    *,
    components: list[dict[str, Any]] | None = None,
    embeds: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
        "data": ephemeral_data(content, components=components, embeds=embeds),
    }


def message_response(data: dict[str, Any]) -> dict[str, Any]:
    """CHANNEL_MESSAGE_WITH_SOURCE (type 4) around a prebuilt message body."""
    body = dict(data)
    body.setdefault("allowed_mentions", NO_MENTIONS)
    return {"type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE, "data": body}


def public_response(content: str) -> dict[str, Any]:
    return {
        "type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
        "data": {"content": content, "allowed_mentions": NO_MENTIONS},
    }


def update_response(data: dict[str, Any]) -> dict[str, Any]:
    """UPDATE_MESSAGE (type 7) — edit the message the component lives on."""
    body = dict(data)
    body.setdefault("allowed_mentions", NO_MENTIONS)
    body.pop("flags", None)  # flags can't change on an update
    return {"type": CALLBACK_TYPE_UPDATE_MESSAGE, "data": body}


def update_text_response(content: str) -> dict[str, Any]:
    """UPDATE_MESSAGE that replaces an ephemeral's text and removes its buttons."""
    return update_response({"content": content, "components": [], "embeds": []})


def deferred_ephemeral_response() -> dict[str, Any]:
    """'Bot is thinking…' (private) — the real answer arrives via edit_original."""
    return {
        "type": CALLBACK_TYPE_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        "data": {"flags": MESSAGE_FLAG_EPHEMERAL},
    }


def modal_response(custom_id: str, title: str, components: list[dict[str, Any]]) -> dict[str, Any]:
    """MODAL (type 9) — a form; its submit comes back as a MODAL_SUBMIT interaction."""
    return {
        "type": CALLBACK_TYPE_MODAL,
        "data": {"custom_id": custom_id, "title": title, "components": components},
    }


def autocomplete_response(choices: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": CALLBACK_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        "data": {"choices": choices[:25]},
    }


# ---------------------------------------------------------------------------
# Defensive parsing helpers
# ---------------------------------------------------------------------------


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


def _modal_fields(components: Any) -> dict[str, str]:
    """Text input values by custom_id from a modal submit's ``data.components``.

    Each input comes back inside the Label that showed it (``component``), or
    inside an action row's ``components`` for modals laid out the old way.
    """
    fields: dict[str, str] = {}
    for raw in _as_list(components):
        wrapper = _as_dict(raw)
        for child in (wrapper.get("component"), *_as_list(wrapper.get("components"))):
            item = _as_dict(child)
            custom_id = item.get("custom_id")
            value = item.get("value")
            if isinstance(custom_id, str) and isinstance(value, str):
                fields[custom_id] = value
    return fields


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _display_name(member: dict[str, Any], user: dict[str, Any]) -> str:
    for candidate in (member.get("nick"), user.get("global_name"), user.get("username")):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()[:100]
    return "Unknown player"
