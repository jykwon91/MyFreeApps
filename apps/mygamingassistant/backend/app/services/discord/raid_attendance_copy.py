"""Copy for raid attendance: the Attendance card and its player card, /raid attendance,
/raid-admin attendance (the summary) and the CSV exports.

Times go in as unix seconds and come out as Discord timestamps (``<t:X:R>``),
so each reader sees their own timezone.  Names come in already escaped.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.services.wow.raid_attendance import PlayerStats

CARD_TITLE: Final = "Attendance"
ATTENDANCE_BUTTON: Final = "Attendance"
RECORD_NOW: Final = "Record now"
COUNT: Final = "Count this raid"
NO_COUNT: Final = "Don't count this raid"
EXPORT: Final = "Export CSV"
OUTCOME_LABELS: Final[dict[str, str]] = {
    "attended": "Attended",
    "late": "Late",
    "standby": "Standby",
    "tentative": "Tentative",
    "absent": "Absent",
    "no_show": "No-show",
}
NOT_SIGNED_UP: Final = "Not signed up"
PLAYER_MENU: Final = "Change how someone is marked…"
ADD_MENU: Final = "Add people who came…"
# The sign-up a player's row was frozen from (the player card's "Signed up as …").
SIGNUP_STATUS_LABELS: Final[dict[str, str]] = {
    "confirmed": "Confirmed",
    "late": "Late",
    "tentative": "Tentative",
    "bench": "Bench",
    "queued": "Waiting list",
    "absence": "Absence",
}

RECORDING: Final = "Finished. Recording now — open this again in a minute."
RECORDED_EARLY: Final = "Recorded early: later sign-up changes don't change it."
COUNTED: Final = "Counts toward attendance."
NOT_COUNTED: Final = "Doesn't count toward attendance."
NOBODY_LISTED: Final = "Nobody is listed."

REMOVE: Final = "Remove"
BACK: Final = "Back"
# The player card of a walk-in whose outcome a leader has changed since adding them.
WALK_IN: Final = "Not signed up: a leader added them."

SKIPPED_BOTS: Final = "Bots can't raid, so I skipped them."
NOT_STARTED: Final = "This raid hasn't started yet."
ALREADY_RECORDED: Final = "Already recorded."
NOW_COUNTED: Final = "This raid now counts toward attendance."
NOW_NOT_COUNTED: Final = "This raid no longer counts toward attendance."
MENU_CAPPED: Final = "The menus show the first 75 players; the CSV has everyone."

NO_COUNTED_RAIDS: Final = "No counted raids yet. A raid's attendance records 6 hours after it starts."
PREVIOUS: Final = "Previous"
NEXT: Final = "Next"
BOTS_DONT_RAID: Final = "Bots don't raid, so they have no attendance."

EXPORT_NOTHING: Final = "No counted raids to export yet."
EXPORT_FAILED: Final = "I couldn't attach the file. Try again in a minute."

_YES_NO: Final = {True: "yes", False: "no"}
# After a summary line, each of these a player has: ' · late 1 · no-show 2'.
_DETAILS: Final = ("late", "standby", "tentative", "absent", "no_show")


def records_at(due: int) -> str:
    return (
        f"Records <t:{due}:R>, 6 hours after the start. Until then it follows the sign-ups: fix those with "
        "**Manage sign-ups**, or record it now to mark no-shows and walk-ins."
    )


def recorded_at(at: int) -> str:
    return f"Recorded <t:{at}:f>."


def player_menu(first: int, last: int) -> str:
    """A player menu's placeholder when there's more than one: which of the card's players it holds."""
    return f"{PLAYER_MENU} ({first}–{last})"


def player_heading(name: str, user_id: str, outcome: str) -> str:
    """'**Thrall** <@id> · Attended' — the player card's first line."""
    return f"**{name}** <@{user_id}> · {OUTCOME_LABELS[outcome]}"


def signed_as(status: str) -> str:
    return f"Signed up as {SIGNUP_STATUS_LABELS[status]}."


def added_by(user_id: str, at: int) -> str:
    return f"Added by <@{user_id}> <t:{at}:R>."


def changed_by(user_id: str, at: int) -> str:
    return f"Changed by <@{user_id}> <t:{at}:R>."


def marked(name: str, outcome: str) -> str:
    return f"Marked **{name}**: {OUTCOME_LABELS[outcome]}."


def added(names: Sequence[str]) -> str:
    return f"Added as Attended: {', '.join(names)}."


def already_listed(names: Sequence[str]) -> str:
    return f"Already listed: {', '.join(names)}."


def removed(name: str) -> str:
    return f"Removed **{name}** from this raid's attendance."


def cant_remove_signup(name: str) -> str:
    return f"{name} signed up, so they stay listed. Mark them No-show or Absent instead."


def not_listed(name: str) -> str:
    return f"{name} isn't listed on this raid any more."


def not_recorded_yet(due: int) -> str:
    return f"Attendance isn't recorded yet. It records <t:{due}:R>, or use **Record now**."


def outcome_counts(counts: dict[str, int]) -> str:
    """'Attended 12 · Late 1 · Absent 3' — a raid not recorded yet, as it would be now."""
    return " · ".join(f"{OUTCOME_LABELS[outcome]} {count}" for outcome, count in counts.items())


def group_heading(outcome: str, count: int) -> str:
    return f"**{OUTCOME_LABELS[outcome]} ({count})**"


def summary_title(raids: int, raid_label: str | None) -> str:
    title = f"Attendance — last {_count(raids, 'counted raid')}"
    if raid_label is None:
        return title
    return f"{title} · {raid_label}"


def summary_sub(bench: bool) -> str:
    return f"Each player from their first raid in this window. Late counts; standby counts: {_YES_NO[bench]}."


def summary_line(stats: PlayerStats, name: str) -> str:
    """'`` 67%`` 2/3 **Thrall** · late 1 · not signed up 1'."""
    line = f"`{stats.percent:>3}%` {stats.present}/{stats.raids} **{name}**"
    details = [f"{OUTCOME_LABELS[o].lower()} {stats.counts[o]}" for o in _DETAILS if stats.counts.get(o)]
    if stats.missed:
        details.append(f"{NOT_SIGNED_UP.lower()} {stats.missed}")
    return " · ".join([line, *details])


def page_footer(page: int, pages: int, players: int) -> str:
    return f"Page {page} of {pages} · {_count(players, 'player')}"


def history_head_self(stats: PlayerStats, first: int, raids: int) -> str:
    return (
        f"You made {stats.present} of {stats.raids} raids ({stats.percent}%) since your first on <t:{first}:D>, "
        f"out of the last {raids} counted."
    )


def history_head_other(user_id: str, stats: PlayerStats, first: int, raids: int) -> str:
    return (
        f"<@{user_id}> made {stats.present} of {stats.raids} raids ({stats.percent}%) since their first on "
        f"<t:{first}:D>, out of the last {raids} counted."
    )


def history_line(starts: int, title: str, outcome: str | None) -> str:
    """'<t:X:d> Onyxia's Lair — Attended'; 'Not signed up' for a raid they missed."""
    label = NOT_SIGNED_UP
    if outcome is not None:
        label = OUTCOME_LABELS[outcome]
    return f"<t:{starts}:d> {title} — {label}"


def history_more(older: int) -> str:
    return f"…and {_count(older, 'older raid')}."


def no_history_self(raids: int) -> str:
    return f"You aren't on any of the last {_count(raids, 'counted raid')}."


def no_history_other(user_id: str, raids: int) -> str:
    return f"<@{user_id}> isn't on any of the last {_count(raids, 'counted raid')}."


def export_done_raid(raid_label: str) -> str:
    return f"Sign-ups and attendance for **{raid_label}**."


def export_done_window(raids: int) -> str:
    return (
        f"The last {_count(raids, 'counted raid')}: one file with a row per player, "
        "one with a row per player per raid."
    )


def _count(count: int, noun: str) -> str:
    """'1 counted raid', '10 counted raids'."""
    if count == 1:
        return f"1 {noun}"
    return f"{count} {noun}s"
