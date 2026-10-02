"""User-facing copy for the create preview and its More options (``raid_draft_views``).

Role pills here sit in private messages, which never ping.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Final

MENTIONS_PROMPT: Final = (
    "Which roles should I ping? I'll ping them when the raid is posted, and again if it still needs players."
)
MENTIONS_OK: Final = "Mentions updated."
MENTIONS_NONE: Final = (
    "Okay, I won't ping any roles for this raid. That includes the reminders when it still needs players."
)
NOTHING_CHANGED: Final = "Nothing changed."
EVERYONE_LEFT_OUT: Final = "I left out `@everyone` because I don't ping it."
_MAKE_MENTIONABLE: Final = 'Turn on "Allow anyone to @mention this role"'


def role_list(role_ids: Sequence[str]) -> str:
    """'<@&a>, <@&b> and <@&c>'."""
    pills = [f"<@&{role_id}>" for role_id in role_ids]
    if len(pills) < 2:
        return "".join(pills)
    return f"{', '.join(pills[:-1])} and {pills[-1]}"


def preview_intro(channel_id: str, role_ids: Sequence[str]) -> str:
    """Above the preview: where the post goes and who it pings."""
    return f"**Preview.** This is how the raid will look in {_where(channel_id, role_ids)}. Does this look right?"


def preview_state(channel_id: str, role_ids: Sequence[str]) -> str:
    """Under More options' first line: where the post goes and who it pings, which its embed can't show."""
    return f"**Preview.** Posts in {_where(channel_id, role_ids)}."


def mentions_line(role_ids: Sequence[str]) -> str:
    if not role_ids:
        return "**Mentions:** *none*"
    return f"**Mentions:** {role_list(role_ids)}"


def mentions_placeholder(limit: int) -> str:
    return f"Pick up to {limit} roles to ping"


def mentions_left_out(role_ids: Sequence[str]) -> str:
    """Roles picked that aren't mentionable, by someone who couldn't ping them either."""
    if len(role_ids) == 1:
        return (
            f"I left out {role_list(role_ids)} because it isn't mentionable and you can't ping it yourself. "
            f"{_MAKE_MENTIONABLE} in the role settings to pick it."
        )
    return (
        f"I left out {role_list(role_ids)} because they aren't mentionable and you can't ping them yourself. "
        f"{_MAKE_MENTIONABLE} in their settings to pick them."
    )


def mentions_heads_up(role_ids: Sequence[str]) -> str:
    """Roles kept that aren't mentionable: I can ping those only if I may mention every role."""
    if len(role_ids) == 1:
        return (
            f"Heads up: {role_list(role_ids)} isn't mentionable, so I may not be able to ping it. "
            f"{_MAKE_MENTIONABLE} in the role settings."
        )
    return (
        f"Heads up: {role_list(role_ids)} aren't mentionable, so I may not be able to ping them. "
        f"{_MAKE_MENTIONABLE} in their settings."
    )


def _where(channel_id: str, role_ids: Sequence[str]) -> str:
    if not role_ids:
        return f"<#{channel_id}>, with no ping"
    return f"<#{channel_id}>, pinging {role_list(role_ids)}"
