"""Raid attendance — the rules, pure (the caller passes ``now``).

Until a raid is recorded its sign-ups are its attendance (``preview_counts``).
At completion (start + ``COMPLETE_AFTER``, ``record_due_at``), or earlier with
[Record now] (``can_record_now``), ``snapshot`` freezes them: one row per
player, with the outcome their status maps to (``outcome_for``).  Leaders then
mark the ``SETTABLE_OUTCOMES``; tentative only ever comes from a sign-up.

Stats are computed on read over a **window**: the guild's last N counted,
recorded raids (``WindowQuery``).  A player is counted from their first raid
in the window on (``summarize``, ``history``): present = attended or late, plus
standby (bench and the waiting list) when ``bench`` is set; a raid since then
without a row is one they missed.
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Final, TypeVar

from app.models.wow.wow_raid_attendance import ATTENDANCE_OUTCOMES, WowRaidAttendance
from app.models.wow.wow_raid_event import RAID_KEYS, WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_deadline import COMPLETE_AFTER

# What a leader can mark someone as (the player card's buttons).
SETTABLE_OUTCOMES: Final = ("attended", "late", "standby", "no_show", "absent")
# The window: how many recent counted raids by default, and at most.
WINDOW_DEFAULT: Final = 10
WINDOW_MAX: Final = 50
# Players on a page of the summary; raids on a history card.
PAGE_SIZE: Final = 25
HISTORY_LINES: Final = 25
# The Attendance card's player menus (25 players each) and how many walk-ins one pick adds.
PLAYER_MENUS: Final = 3
MENU_SIZE: Final = 25
ADD_MAX: Final = 10
# A window over every raid, in a summary custom_id (raid_custom_id.NO_ARG).
ANY_RAID: Final = "-"

_OUTCOME_BY_STATUS: Final[dict[str, str]] = {
    "confirmed": "attended",
    "late": "late",
    "bench": "standby",
    "queued": "standby",
    "tentative": "tentative",
    "absence": "absent",
}
_PRESENT: Final = frozenset({"attended", "late"})
_OUTCOME_ORDER: Final = {outcome: index for index, outcome in enumerate(ATTENDANCE_OUTCOMES)}
_RAID_ARGS: Final[dict[str, str | None]] = {ANY_RAID: None, **{key: key for key in RAID_KEYS}}
_BENCH_ARGS: Final = {"0": False, "1": True}

T = TypeVar("T")


@dataclass(frozen=True)
class SnapshotRow:
    """One player's row when a raid's sign-ups are frozen."""

    discord_user_id: str
    display_name: str
    character_name: str | None
    wow_class: str | None
    signup_status: str
    outcome: str


@dataclass(frozen=True)
class PlayerStats:
    """A player over the window, from their first raid in it on.

    The names and class are their newest row's.  ``counts`` holds each
    outcome they had; ``missed`` the raids since their first without a row.
    """

    discord_user_id: str
    display_name: str
    character_name: str | None
    wow_class: str | None
    raids: int
    present: int
    percent: int
    counts: Mapping[str, int]
    missed: int
    first_at: datetime
    last_at: datetime

    @property
    def name(self) -> str:
        """The name they go by: their character's, else their Discord name."""
        return self.character_name or self.display_name


@dataclass(frozen=True)
class HistoryLine:
    """One raid on a player's history: their outcome, or None when they weren't signed up."""

    event: WowRaidEvent
    outcome: str | None


@dataclass(frozen=True)
class WindowQuery:
    """Which raids the stats cover: the last *count* counted ones, of one raid or any; whether standby counts."""

    raid_key: str | None = None
    count: int = WINDOW_DEFAULT
    bench: bool = False

    def to_args(self) -> tuple[str, str, str]:
        """The window in a summary custom_id: '<raid|->', '<count>', '<0|1>'."""
        return (self.raid_key or ANY_RAID, str(self.count), str(int(self.bench)))

    @classmethod
    def from_args(cls, raid: str, count: str, bench: str) -> WindowQuery | None:
        """The window from a custom_id's args; None unless each is one ``to_args`` writes."""
        if raid not in _RAID_ARGS or bench not in _BENCH_ARGS:
            return None
        if not (count.isascii() and count.isdecimal()) or count.startswith("0") or int(count) > WINDOW_MAX:
            return None
        return cls(raid_key=_RAID_ARGS[raid], count=int(count), bench=_BENCH_ARGS[bench])


def outcome_for(status: str) -> str:
    """A sign-up's outcome when its raid is recorded: a seat attended (or came late), bench and queue standby."""
    return _OUTCOME_BY_STATUS[status]


def snapshot(signups: Iterable[WowRaidSignup]) -> list[SnapshotRow]:
    """The raid's sign-ups as attendance rows, one per player."""
    return [
        SnapshotRow(
            discord_user_id=signup.discord_user_id,
            display_name=signup.display_name,
            character_name=signup.character_name,
            wow_class=signup.wow_class,
            signup_status=signup.status,
            outcome=outcome_for(signup.status),
        )
        for signup in signups
    ]


def preview_counts(signups: Iterable[WowRaidSignup]) -> dict[str, int]:
    """How many players each outcome would have if the raid were recorded now (outcomes in order, none at 0)."""
    counts = Counter(outcome_for(signup.status) for signup in signups)
    return {outcome: counts[outcome] for outcome in ATTENDANCE_OUTCOMES if counts[outcome]}


def is_present(outcome: str, *, bench: bool) -> bool:
    """Whether an outcome counts as there: attended or late, and standby when *bench*."""
    return outcome in _PRESENT or (bench and outcome == "standby")


def record_due_at(event: WowRaidEvent) -> datetime:
    """When the worker records the raid: as it completes, 6 hours after the start."""
    return event.starts_at + COMPLETE_AFTER


def can_record_now(event: WowRaidEvent, now: datetime) -> bool:
    """Whether [Record now] can freeze it: on, started, and not recorded yet."""
    return event.status == "scheduled" and event.starts_at <= now and event.attendance_recorded_at is None


def recorded_early(event: WowRaidEvent) -> bool:
    """Whether it was recorded before it completed ([Record now]): later sign-up changes don't reach it."""
    return event.attendance_recorded_at is not None and event.attendance_recorded_at < record_due_at(event)


def shown_name(mark: WowRaidAttendance) -> str:
    """The name a row goes by: the character's, else the Discord name."""
    return mark.character_name or mark.display_name


def in_card_order(marks: Iterable[WowRaidAttendance]) -> list[WowRaidAttendance]:
    """Rows by outcome (in ``ATTENDANCE_OUTCOMES`` order), then name: the card's groups and menus."""
    return sorted(marks, key=lambda m: (_OUTCOME_ORDER[m.outcome], shown_name(m).casefold(), m.discord_user_id))


def grouped(marks: Iterable[WowRaidAttendance]) -> list[tuple[str, list[WowRaidAttendance]]]:
    """The rows under each outcome they have, outcomes in order, names in order."""
    groups: dict[str, list[WowRaidAttendance]] = {}
    for mark in in_card_order(marks):
        groups.setdefault(mark.outcome, []).append(mark)
    return list(groups.items())


def summarize(
    raids: Sequence[WowRaidEvent], marks: Iterable[WowRaidAttendance], *, bench: bool
) -> list[PlayerStats]:
    """Each player over the window: best percentage first, then most raids made, then by name."""
    ordered, rows_by_player = _by_player(raids, marks)
    stats = [_stats(player, rows, ordered, bench=bench) for player, rows in rows_by_player.items()]
    return sorted(stats, key=lambda s: (-s.percent, -s.present, s.name.casefold(), s.discord_user_id))


def history(
    raids: Sequence[WowRaidEvent], marks: Iterable[WowRaidAttendance], *, bench: bool
) -> tuple[PlayerStats | None, list[HistoryLine]]:
    """One player's window (*marks* are theirs): their stats and a line per raid from their first on, newest first.

    ``(None, [])`` when they aren't on any raid in it.
    """
    ordered, rows_by_player = _by_player(raids, marks)
    if not rows_by_player:
        return None, []
    [(player, rows)] = rows_by_player.items()
    stats = _stats(player, rows, ordered, bench=bench)
    outcomes = {row.event_id: row.outcome for row in rows}
    since = ordered[len(ordered) - stats.raids :]
    return stats, [HistoryLine(event, outcomes.get(event.id)) for event in reversed(since)]


def capped(lines: Sequence[T], limit: int = HISTORY_LINES) -> tuple[Sequence[T], int]:
    """The first *limit* lines, and how many more there are."""
    return lines[:limit], max(0, len(lines) - limit)


def page_of(items: Sequence[T], page: int) -> tuple[Sequence[T], int, int]:
    """Page *page* of *items* (``PAGE_SIZE`` each), clamped to 1…pages; also returns the page and the page count."""
    pages = max(1, -(-len(items) // PAGE_SIZE))
    page = min(max(page, 1), pages)
    start = (page - 1) * PAGE_SIZE
    return items[start : start + PAGE_SIZE], page, pages


def percent(present: int, raids: int) -> int:
    """*present* of *raids* as a whole percentage, half rounded up (1 of 8 → 13)."""
    return (200 * present + raids) // (2 * raids)


def _by_player(
    raids: Sequence[WowRaidEvent], marks: Iterable[WowRaidAttendance]
) -> tuple[list[WowRaidEvent], dict[str, list[WowRaidAttendance]]]:
    """The window oldest first (ties by id), and each player's rows in it, oldest first."""
    ordered = sorted(raids, key=lambda event: (event.starts_at, event.id))
    place = {event.id: index for index, event in enumerate(ordered)}
    rows_by_player: dict[str, list[WowRaidAttendance]] = {}
    for mark in sorted((m for m in marks if m.event_id in place), key=lambda m: place[m.event_id]):
        rows_by_player.setdefault(mark.discord_user_id, []).append(mark)
    return ordered, rows_by_player


def _stats(
    player: str, rows: list[WowRaidAttendance], ordered: list[WowRaidEvent], *, bench: bool
) -> PlayerStats:
    place = {event.id: index for index, event in enumerate(ordered)}
    first = place[rows[0].event_id]
    raids = len(ordered) - first
    present = sum(1 for row in rows if is_present(row.outcome, bench=bench))
    newest = rows[-1]
    return PlayerStats(
        discord_user_id=player,
        display_name=newest.display_name,
        character_name=newest.character_name,
        wow_class=newest.wow_class,
        raids=raids,
        present=present,
        percent=percent(present, raids),
        counts=Counter(row.outcome for row in rows),
        missed=raids - len(rows),
        first_at=ordered[first].starts_at,
        last_at=ordered[place[newest.event_id]].starts_at,
    )
