"""What the raid bot says about a raid's advanced settings (Raid: Edit → Advanced, /raid-admin advanced).

The cards' lines and their menus' descriptions (``raid_advanced_views``), the
sub-cards' prompts, the notices after a change, the Minimum form, the
refusal a member gets when Who can sign up keeps them out
(``raid_context.join_refusal``), and the detail line on More options and
Raid: Edit.  The post's "Open to" line and a minimum's cancel reason are
``raid_advanced``'s; the post options' own words (pin, voice channel,
delete) are ``raid_post_options_copy``'s.

A value the raid takes from the server is tagged " (server default)".
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_post_options_copy
from app.services.discord.raid_draft_copy import role_list
from app.services.wow import raid_advanced
from app.services.wow.raid_advanced import AccessRefusal, MinimumProblem, RoleList, Source
from app.services.wow.raid_advanced_service import MinimumSaved, RolesSaved
from app.services.wow.raid_text import local_day_label, title_text

BUTTON: Final = "Advanced"
PLACEHOLDER: Final = "Change a setting…"
# The cards' menu: a label per setting (``raid_advanced.SETTING_KEYS``).
LABELS: Final = {
    "min": "Minimum sign-ups",
    "who": "Who can sign up",
    "ready": "Ready check",
    "pin": "Pin the post",
    "voice": "Voice channel",
    "del": "Delete the post",
}
INHERITED: Final = " (server default)"

MINIMUM_TITLE: Final = "Minimum sign-ups"
MINIMUM_LABEL: Final = "Cancel the raid if fewer sign up"
MINIMUM_HINT: Final = "Checked once, when sign-ups close. Seats count: Confirmed and Late."
MINIMUM_PLACEHOLDER: Final = "e.g. 10 — leave empty for no minimum"

ALLOW_PLACEHOLDER: Final = "Only these roles can sign up"
BAN_PLACEHOLDER: Final = "These roles can't sign up"
EVERYONE_BUTTON: Final = "Everyone can sign up"
INHERIT_BUTTON: Final = "Use server default"
WHO_FOOTNOTE: Final = "People already signed up stay on, and leaders can still add anyone with Manage sign-ups."
EVERYONE_PICKED: Final = "Pick roles, not `@everyone`."
EVERYONE_LEFT_OUT: Final = "`@everyone` was left out."
EVERYONE_NOTICE: Final = "Saved: everyone can sign up for this raid."
INHERIT_NOTICE: Final = "Saved: this raid follows the server default."

READY_PLACEHOLDER: Final = "When should it go out?"
_READY_WHAT: Final = "the bot posts in the raid channel and mentions everyone with a seat."

SERVER_TITLE: Final = "**Server defaults**"
SERVER_INTRO: Final = "Every raid follows these unless it sets its own (Raid: Edit → **Advanced**)."
SERVER_FOOTNOTE: Final = "Raids already posted keep their ready check; the rest reaches them right away."
SERVER_WHO_PROMPT: Final = "Who can sign up for raids that don't set their own?"
SERVER_READY_PROMPT: Final = f"Ready check for raids that don't set their own — {_READY_WHAT}"


def label(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    """'Molten Core · Sat Oct 10' — the raid, as the cards name it."""
    return f"{title_text(event)} · {local_day_label(event.starts_at, guild.timezone)}"


def title(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    return f"**Advanced — {label(event, guild)}**"


def setting_lines(event: WowRaidEvent, guild: WowRaidGuild) -> list[str]:
    """The card's lines: the minimum, who can and can't sign up, the ready check, then the post's options."""
    return [
        minimum_line(event),
        *who_lines(event, guild),
        ready_line(event, guild),
        pin_line(event, guild),
        voice_line(event, guild),
        raid_post_options_copy.delete_value_line(event.delete_post_after_hours),
    ]


def server_lines(guild: WowRaidGuild) -> list[str]:
    """/raid-admin advanced's lines: who can and can't sign up, the ready check, the pin, the voice channel."""
    return [
        *server_who_lines(guild),
        server_ready_line(raid_advanced.server_ready_check(guild)),
        raid_post_options_copy.pin_value_line(bool(guild.pin_posts)),
        raid_post_options_copy.voice_value_line(guild.voice_channel_id),
    ]


def minimum_line(event: WowRaidEvent) -> str:
    """'Minimum sign-ups: **10** — below that when sign-ups close, the raid is cancelled' (or none)."""
    minimum = event.min_signups
    if minimum is None:
        return "Minimum sign-ups: none"
    if minimum > event.size_cap:
        cap = event.size_cap
        return f"Minimum sign-ups: **{minimum}** — the raid has {cap} seats, so all {cap} must be filled"
    return f"Minimum sign-ups: **{minimum}** — below that when sign-ups close, the raid is cancelled"


def who_lines(event: WowRaidEvent, guild: WowRaidGuild) -> list[str]:
    """'Who can sign up: <@&a> <@&b>' and 'Can't sign up: nobody', each tagged when it's the server's."""
    allowed = raid_advanced.signup_roles(event, guild)
    banned = raid_advanced.banned_roles(event, guild)
    return [
        _who_line("signup", allowed.value, _tag(allowed.source)),
        _who_line("banned", banned.value, _tag(banned.source)),
    ]


def server_who_lines(guild: WowRaidGuild) -> list[str]:
    """The server's own lists, as /raid-admin advanced says them."""
    return [
        _who_line("signup", raid_advanced.server_roles(guild, "signup")),
        _who_line("banned", raid_advanced.server_roles(guild, "banned")),
    ]


def _who_line(which: RoleList, role_ids: Sequence[str], tag: str = "") -> str:
    mentions = " ".join(f"<@&{role_id}>" for role_id in role_ids)
    if which == "signup":
        return f"Who can sign up: {mentions or 'everyone'}{tag}"
    return f"Can't sign up: {mentions or 'nobody'}{tag}"


def _tag(source: Source) -> str:
    """' (server default)' after a value the raid doesn't set itself."""
    if source == "raid":
        return ""
    return INHERITED


def who_prompt(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    return f"Who can sign up for **{label(event, guild)}**?"


def roles_notice(which: RoleList, saved: RolesSaved, *, server: bool) -> str:
    """After a role menu: what's saved, and that ``@everyone`` was left out; nothing saved when only it was picked."""
    if not saved.saved:
        return EVERYONE_PICKED
    where = " for this raid"
    if server:
        where = ", unless a raid sets its own"
    notice = _roles_saved(which, saved.role_ids, where)
    if saved.everyone:
        return f"{notice} {EVERYONE_LEFT_OUT}"
    return notice


def _roles_saved(which: RoleList, role_ids: Sequence[str], where: str) -> str:
    if which == "signup" and role_ids:
        return f"Saved: only {role_list(role_ids)} can sign up{where}."
    if which == "signup":
        return f"Saved: everyone can sign up{where}."
    if role_ids:
        return f"Saved: {role_list(role_ids)} can't sign up{where}."
    return f"Saved: no role is kept from signing up{where}."


def refusal(refused: AccessRefusal, leader: str) -> str:
    """Why a member can't join the raid (Who can sign up), and who to ask."""
    if refused.kind == "banned":
        return f"You can't sign up for this raid. Ask <@{leader}> if that's a mistake."
    return f"This raid is open to {role_list(refused.roles)} only. Ask <@{leader}> if you should be on it."


def ready_words(minutes: int) -> str:
    """'15 minutes', '1 hour', '90 minutes', '2 hours' (*minutes* > 0)."""
    if minutes == 60:
        return "1 hour"
    if minutes % 60 == 0:
        return f"{minutes // 60} hours"
    return f"{minutes} minutes"


def ready_label(minutes: int) -> str:
    """A Ready check menu option: 'Off', '15 minutes before', '1 hour before'."""
    if minutes == 0:
        return "Off"
    return f"{ready_words(minutes)} before"


def ready_inherit_label(server_minutes: int) -> str:
    """The raid's menu's first option: 'Server default (1 hour)', or '(off)'."""
    if server_minutes == 0:
        return "Server default (off)"
    return f"Server default ({ready_words(server_minutes)})"


def ready_line(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    """'Ready check: **1 hour** before the start (server default)' / 'Ready check: **off**'."""
    found = raid_advanced.ready_check(event, guild)
    return server_ready_line(found.value) + _tag(found.source)


def server_ready_line(minutes: int) -> str:
    if minutes == 0:
        return "Ready check: **off**"
    return f"Ready check: **{ready_words(minutes)}** before the start"


def pin_line(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    """'Pin the post: **on** until the raid starts (server default)' / 'Pin the post: **off**'."""
    found = raid_advanced.pin_setting(event, guild)
    return raid_post_options_copy.pin_value_line(bool(found.value)) + _tag(found.source)


def voice_line(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    """'Voice channel: <#id> (server default)' / 'Voice channel: none'."""
    found = raid_advanced.voice_channel(event, guild)
    return raid_post_options_copy.voice_value_line(found.value) + _tag(found.source)


def ready_prompt(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    return f"Ready check for **{label(event, guild)}** — {_READY_WHAT}"


def ready_notice(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    """After a Ready check pick: the raid's own choice, or the server's it now follows."""
    found = raid_advanced.ready_check(event, guild)
    if found.source != "raid":
        return f"Saved: this raid follows the server default ({_ready_when(found.value)})."
    if found.value == 0:
        return "Saved: no ready check for this raid."
    return f"Saved: the ready check goes out {ready_words(found.value)} before the start."


def server_ready_notice(minutes: int) -> str:
    if minutes == 0:
        return "Saved: raids posted from now on get no ready check, unless they set their own."
    return (
        f"Saved: raids posted from now on get the ready check {ready_words(minutes)} before the start, "
        "unless they set their own."
    )


def _ready_when(minutes: int) -> str:
    if minutes == 0:
        return "off"
    return f"{ready_words(minutes)} before the start"


def minimum_notice(saved: MinimumSaved, event: WowRaidEvent) -> str:
    """What the Minimum form did: saved (or not checked, sign-ups having closed), cleared, unchanged, or why not."""
    if saved.problem is not None:
        return _minimum_problem(saved.problem)
    if saved.kind == "cleared":
        return "No minimum."
    if saved.kind == "same":
        return "That's already the minimum."
    if saved.closed and event.series_id is None:
        return "Saved. Sign-ups on this raid have closed, so it won't be checked."
    if saved.closed:
        return "Saved. Sign-ups on this raid have closed, so it won't be checked — its repeats will be."
    return (
        f"Saved. If fewer than {saved.value} have a seat when sign-ups close, "
        "the raid is cancelled and everyone on it is told."
    )


def _minimum_problem(problem: MinimumProblem) -> str:
    if problem.kind == "number":
        return "Type a whole number, like 10."
    if problem.kind == "zero":
        return "It has to be at least 1 — leave it empty for no minimum."
    return f"The raid has {problem.cap} seats, so the minimum can be {problem.cap} at most."


def summaries(event: WowRaidEvent, guild: WowRaidGuild) -> list[tuple[str, str]]:
    """(setting, its value in words) for the card's menu — mentions don't render in a menu."""
    allowed = raid_advanced.signup_roles(event, guild)
    banned = raid_advanced.banned_roles(event, guild)
    who = _who_summary(allowed.value, banned.value)
    if event.signup_role_ids is None and event.banned_role_ids is None:
        who += INHERITED
    ready = raid_advanced.ready_check(event, guild)
    pin = raid_advanced.pin_setting(event, guild)
    voice = raid_advanced.voice_channel(event, guild)
    return [
        ("min", _minimum_summary(event)),
        ("who", who),
        ("ready", _ready_summary(ready.value) + _tag(ready.source)),
        ("pin", raid_post_options_copy.pin_summary(bool(pin.value)) + _tag(pin.source)),
        ("voice", raid_post_options_copy.voice_summary(voice.value) + _tag(voice.source)),
        ("del", raid_post_options_copy.delete_summary(event.delete_post_after_hours)),
    ]


def server_summaries(guild: WowRaidGuild) -> list[tuple[str, str]]:
    """(setting, its value in words) for /raid-admin advanced's menu."""
    who = _who_summary(raid_advanced.server_roles(guild, "signup"), raid_advanced.server_roles(guild, "banned"))
    return [
        ("who", who),
        ("ready", _ready_summary(raid_advanced.server_ready_check(guild))),
        ("pin", raid_post_options_copy.pin_summary(bool(guild.pin_posts))),
        ("voice", raid_post_options_copy.voice_summary(guild.voice_channel_id)),
    ]


def _minimum_summary(event: WowRaidEvent) -> str:
    minimum = event.min_signups
    if minimum is None:
        return "No minimum"
    if minimum > event.size_cap:
        return f"All {event.size_cap} seats, or the raid is cancelled when sign-ups close"
    return f"{minimum} seats, or the raid is cancelled when sign-ups close"


def _who_summary(allowed: Sequence[str], banned: Sequence[str]) -> str:
    """'Open to everyone' / 'Open to 2 roles', then ' · 1 role blocked'."""
    summary = "Open to everyone"
    if allowed:
        summary = f"Open to {_roles(len(allowed))}"
    if banned:
        summary += f" · {_roles(len(banned))} blocked"
    return summary


def _ready_summary(minutes: int) -> str:
    if minutes == 0:
        return "Off"
    return f"{ready_words(minutes)} before the start"


def _roles(count: int) -> str:
    if count == 1:
        return "1 role"
    return f"{count} roles"


def detail_lines(event: WowRaidEvent) -> list[str]:
    """'**Advanced:** minimum 10 · open to 2 roles · ready check off · pinned' — the raid's own values only."""
    parts: list[str] = []
    if event.min_signups is not None:
        parts.append(f"minimum {event.min_signups}")
    if event.signup_role_ids is not None:
        parts.append(_open_to(event.signup_role_ids))
    if event.banned_role_ids is not None:
        parts.append(_blocked(event.banned_role_ids))
    if event.ready_check_minutes is not None:
        parts.append(f"ready check {_ready_detail(event.ready_check_minutes)}")
    parts.extend(
        raid_post_options_copy.detail_parts(event.pin_post, event.voice_channel_id, event.delete_post_after_hours)
    )
    if not parts:
        return []
    return ["**Advanced:** " + " · ".join(parts)]


def _open_to(role_ids: Sequence[object]) -> str:
    if not role_ids:
        return "open to everyone"
    return f"open to {_roles(len(role_ids))}"


def _blocked(role_ids: Sequence[object]) -> str:
    if not role_ids:
        return "nobody blocked"
    return f"{_roles(len(role_ids))} blocked"


def _ready_detail(minutes: int) -> str:
    if minutes == 0:
        return "off"
    return f"{ready_words(minutes)} before"
