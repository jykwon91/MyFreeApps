"""What the raid bot says about a raid post's options: pin the post, its voice channel, delete it after the raid.

Raid: Edit → Advanced's sub-cards and /raid-admin advanced's: their prompts
and buttons, the Advanced cards' lines and menu descriptions
(``raid_advanced_copy`` puts them there), the notices after a change, and
why a pin didn't go through — on the Pin the post card, the "Posted"
message and /raid-admin setup's check.  The post's own "Voice: <#id>" line
is ``raid_advanced``'s.
"""
from __future__ import annotations

from typing import Final

from app.services.wow.raid_advanced import NO_VOICE, PinResult

PIN_UNTIL: Final = "It stays pinned until the raid starts or is cancelled."
PIN_BUTTON: Final = "Pin it"
UNPIN_BUTTON: Final = "Don't pin"
SERVER_PIN_BUTTON: Final = "Pin raid posts"
SERVER_PIN_PROMPT: Final = "Pin the posts of raids that don't set their own?"
SERVER_PIN_NEEDS: Final = (
    "They stay pinned until the raid starts or is cancelled. The bot needs **Pin Messages** in the raid channel."
)

VOICE_PLACEHOLDER: Final = "Pick a voice channel"
NO_VOICE_BUTTON: Final = "No voice channel"
SERVER_VOICE_PROMPT: Final = "Voice channel for raids that don't set their own — the posts show a link to it."

DELETE_PLACEHOLDER: Final = "When should the post go?"
DELETE_STAYS: Final = "The raid itself stays (attendance and history); only the post goes."
KEEP_LABEL: Final = "Keep the post"

# A pin that didn't go through is tried again on every refresh of the post.
_RETRY: Final = "I'll try again the next time the post updates"
# What a pin or an unpin that Discord refused leaves the post as.
_LEFT: Final = {"pin": "isn't pinned", "unpin": "is still pinned"}
_PIN_DETAIL: Final = {True: "pinned", False: "not pinned"}
# The Delete the post menu's longest delay, in hours.
_WEEK: Final = 168


# ---------------------------------------------------------------------------
# Pin the post
# ---------------------------------------------------------------------------


def pin_prompt(label: str) -> str:
    return f"Pin the post for **{label}**?"


def pin_value_line(on: bool) -> str:
    """'Pin the post: **on** until the raid starts' / 'Pin the post: **off**'."""
    if on:
        return "Pin the post: **on** until the raid starts"
    return "Pin the post: **off**"


def pin_summary(on: bool) -> str:
    """The cards' menu description: 'Pinned until the raid starts' / 'Not pinned'."""
    if on:
        return "Pinned until the raid starts"
    return "Not pinned"


def pin_inherit_label(server_on: bool) -> str:
    """The Pin the post card's server button: 'Server default (on)' / 'Server default (off)'."""
    if server_on:
        return "Server default (on)"
    return "Server default (off)"


def pin_saved(on: bool, *, server: bool) -> str:
    """After a Pin the post button: what's saved, for the raid or (*server*) the raids that follow the server."""
    if server and on:
        return "Saved: raid posts are pinned until the raid starts, unless a raid sets its own."
    if server:
        return "Saved: raid posts aren't pinned, unless a raid sets its own."
    if on:
        return "Saved: this raid's post is pinned until the raid starts."
    return "Saved: this raid's post isn't pinned."


def busy(pinning: bool) -> str:
    """The Pin the post card while the pin changes."""
    if pinning:
        return "Pinning the post…"
    return "Unpinning the post…"


def pin_problem(result: PinResult | None) -> str | None:
    """The Pin the post card's notice when its pin didn't go through; None when it did (or none was needed)."""
    if result is None or result.kind == "done":
        return None
    if result.kind == "failed":
        return f"Saved, but Discord didn't {result.step} the post just now; {_RETRY}."
    return f"Saved, but the post {_LEFT[result.step]}: {_why(result)}; {_RETRY}."


def with_pin_problem(extra: str | None, result: PinResult | None) -> str | None:
    """[Post raid]'s "Posted" lines (*extra*), then why the post isn't pinned when it isn't."""
    if result is None or result.kind == "done":
        return extra
    problem = f"Discord didn't pin the post just now; {_RETRY}."
    if result.kind != "failed":
        problem = f"Not pinned: {_why(result)}; {_RETRY}."
    return "\n".join(line for line in (extra, problem) if line)


def _why(result: PinResult) -> str:
    if result.kind == "permission":
        return f"the bot needs **Pin Messages** in <#{result.channel_id}>"
    return f"<#{result.channel_id}> has as many pins as Discord allows"


def setup_no_pins(channel_id: str) -> str:
    """/raid-admin setup's check, while the server pins raid posts and the bot can't pin there."""
    return f"Raid posts won't be pinned until the bot has **Pin Messages** in <#{channel_id}>."


# ---------------------------------------------------------------------------
# Voice channel
# ---------------------------------------------------------------------------


def voice_prompt(label: str) -> str:
    return f"Voice channel for **{label}** — the post shows a link to it."


def voice_value_line(channel_id: str | None) -> str:
    """'Voice channel: <#id>' / 'Voice channel: none'."""
    if channel_id is None:
        return "Voice channel: none"
    return f"Voice channel: <#{channel_id}>"


def voice_summary(channel_id: str | None) -> str:
    """The cards' menu description (a mention doesn't render in a menu): 'Linked on the post' / 'None'."""
    if channel_id is None:
        return "None"
    return "Linked on the post"


def voice_saved(channel_id: str | None, *, server: bool) -> str:
    """After a voice channel pick or button: what the raid's post (or, *server*, the posts) now show."""
    if server and channel_id is None:
        return "Saved: raid posts show no voice channel, unless a raid sets its own."
    if server:
        return f"Saved: raid posts show <#{channel_id}>, unless a raid sets its own."
    if channel_id is None:
        return "Saved: no voice channel on this raid's post."
    return f"Saved: the post shows <#{channel_id}>."


# ---------------------------------------------------------------------------
# Delete the post
# ---------------------------------------------------------------------------


def delete_prompt(label: str) -> str:
    return f"Delete the post for **{label}** after the raid?"


def delay_words(hours: int) -> str:
    """'3 hours', '1 day', '2 days', '1 week'."""
    if hours == _WEEK:
        return "1 week"
    if hours % 24:
        return _count(hours, "hour")
    return _count(hours // 24, "day")


def delete_value_line(hours: int | None) -> str:
    """'Delete the post: **1 day** after the raid' / 'Delete the post: **never**'."""
    if hours is None:
        return "Delete the post: **never**"
    return f"Delete the post: **{delay_words(hours)}** after the raid"


def delete_summary(hours: int | None) -> str:
    """The card's menu description: '1 day after the raid' / 'Never'."""
    if hours is None:
        return "Never"
    return f"{delay_words(hours)} after the raid"


def delete_option(hours: int) -> str:
    """A Delete the post menu option: '3 hours after', '1 week after'."""
    return f"{delay_words(hours)} after"


def delete_saved(hours: int | None) -> str:
    if hours is None:
        return "Saved: the post stays up after the raid."
    return f"Saved: the post is deleted {delay_words(hours)} after the raid ends."


def detail_parts(pin: bool | None, voice: str | None, delete_hours: int | None) -> list[str]:
    """The raid's own post options on the "**Advanced:**" detail line: 'pinned', 'voice <#id>', 'post deleted …'."""
    parts: list[str] = []
    if pin is not None:
        parts.append(_PIN_DETAIL[pin])
    if voice is not None:
        parts.append(_voice_detail(voice))
    if delete_hours is not None:
        parts.append(f"post deleted {delay_words(delete_hours)} after")
    return parts


def _voice_detail(voice: str) -> str:
    if voice == NO_VOICE:
        return "no voice channel"
    return f"voice <#{voice}>"


def _count(count: int, unit: str) -> str:
    if count == 1:
        return f"1 {unit}"
    return f"{count} {unit}s"
