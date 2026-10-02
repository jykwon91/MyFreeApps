"""Raid attendance cards — pure builders.

* ``attendance_card`` — Raid: Signed → [Attendance], for the raid's leader.
  Until it's recorded: when it records and how its sign-ups would count, with
  [Record now] once it has started.  After: everyone by outcome, three menus
  of players to change how someone is marked, a menu to add people who came
  without signing up, and both times the counted toggle and [Export CSV].
* ``player_card`` — one player on it: how they're marked and where that came
  from, a button per outcome, [Back] and, for someone a leader added, [Remove].
* ``history_card`` — /raid attendance, and /raid-admin attendance with a
  player: their raids in the window, newest first.
* ``summary_card`` — /raid-admin attendance: every player's percentage, a
  page at a time, with [Export CSV].
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_STRING_SELECT,
    COMPONENT_TYPE_USER_SELECT,
)

from app.models.wow.wow_raid_attendance import WowRaidAttendance
from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_attendance_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import EMBED_DESCRIPTION_LIMIT, action_row, button, clip_lines, unix
from app.services.wow import raid_custom_id
from app.services.wow.raid_attendance import (
    ADD_MAX,
    MENU_SIZE,
    PLAYER_MENUS,
    SETTABLE_OUTCOMES,
    WindowQuery,
    can_record_now,
    capped,
    grouped,
    history,
    in_card_order,
    page_of,
    preview_counts,
    record_due_at,
    recorded_early,
    shown_name,
    summarize,
)
from app.services.wow.raid_attendance_service import RaidSheet, Window
from app.services.wow.raid_catalog import raid_name
from app.services.wow.raid_custom_id import MANAGE_MAX_PAGE
from app.services.wow.raid_embed import COLOR_OPEN, post_color
from app.services.wow.raid_text import escape_name, title_text

# A select option's label, at most.
_OPTION_CHARS: Final = 100
_COUNTED_LINES: Final = {True: raid_attendance_copy.COUNTED, False: raid_attendance_copy.NOT_COUNTED}
# The player card's outcome buttons: the one they have stands out (and is greyed out).
_OUTCOME_STYLES: Final = {True: BUTTON_STYLE_PRIMARY, False: BUTTON_STYLE_SECONDARY}


# ---------------------------------------------------------------------------
# The Attendance card and its player card
# ---------------------------------------------------------------------------


def attendance_card(
    event: WowRaidEvent, sheet: RaidSheet, *, now: datetime, notice: str | None = None
) -> dict[str, Any]:
    """The raid's attendance, for its leader: what it would be until it's recorded, then who came and how.

    *notice* goes above the card, e.g. what a change did.
    """
    if event.attendance_recorded_at is None:
        lines, components = _not_recorded(event, sheet, now)
    else:
        lines, components = _recorded(event, sheet.marks)
    return ephemeral_data(notice or "", components=components, embeds=[_embed(event, lines)])


def player_card(event: WowRaidEvent, mark: WowRaidAttendance, *, notice: str | None = None) -> dict[str, Any]:
    """One player on the raid's attendance: their outcome and where it came from, and a button per outcome.

    Their current outcome's button is greyed out (a tentative player has all
    five).  [Remove] shows only for someone a leader added: a player who
    signed up stays listed.
    """
    name = escape_name(shown_name(mark))
    lines = [
        raid_line(event),
        raid_attendance_copy.player_heading(name, mark.discord_user_id, mark.outcome),
        *_source(mark),
    ]
    outcomes = [
        button(
            raid_attendance_copy.OUTCOME_LABELS[outcome],
            _OUTCOME_STYLES[outcome == mark.outcome],
            raid_custom_id.attendance(event.id, "set", mark.discord_user_id, outcome),
            disabled=outcome == mark.outcome,
        )
        for outcome in SETTABLE_OUTCOMES
    ]
    nav = [button(raid_attendance_copy.BACK, BUTTON_STYLE_SECONDARY, raid_custom_id.attendance(event.id, "open"))]
    if mark.signup_status is None:
        drop = raid_custom_id.attendance(event.id, "drop", mark.discord_user_id)
        nav.append(button(raid_attendance_copy.REMOVE, BUTTON_STYLE_DANGER, drop))
    components = [action_row(*outcomes), action_row(*nav)]
    return ephemeral_data(notice or "", components=components, embeds=[_embed(event, lines)])


def _embed(event: WowRaidEvent, lines: list[str]) -> dict[str, Any]:
    """Like Raid: Signed's: the post's colour and the raid's id underneath."""
    return {
        "title": raid_attendance_copy.CARD_TITLE,
        "description": clip_lines("\n".join(lines), EMBED_DESCRIPTION_LIMIT),
        "color": post_color(event),
        "footer": {"text": f"Raid ID {str(event.id)[:6]}"},
    }


def _not_recorded(
    event: WowRaidEvent, sheet: RaidSheet, now: datetime
) -> tuple[list[str], list[dict[str, Any]]]:
    """When it records (or that it's recording now it's finished), and how its sign-ups would count."""
    state = raid_attendance_copy.RECORDING
    if event.status == "scheduled":
        state = raid_attendance_copy.records_at(unix(record_due_at(event)))
    counts = preview_counts(sheet.signups)
    preview = raid_attendance_copy.NOBODY_LISTED
    if counts:
        preview = raid_attendance_copy.outcome_counts(counts)
    buttons = [_count_toggle(event), _export(event)]
    if can_record_now(event, now):
        record = raid_custom_id.attendance(event.id, "record")
        buttons.insert(0, button(raid_attendance_copy.RECORD_NOW, BUTTON_STYLE_PRIMARY, record))
    lines = [raid_line(event), state, _COUNTED_LINES[event.attendance_counted], "", preview]
    return lines, [action_row(*buttons)]


def _recorded(
    event: WowRaidEvent, marks: Sequence[WowRaidAttendance]
) -> tuple[list[str], list[dict[str, Any]]]:
    """Who came and how, a heading per outcome, with the menus that change it."""
    assert event.attendance_recorded_at is not None
    lines = [raid_line(event), raid_attendance_copy.recorded_at(unix(event.attendance_recorded_at))]
    if recorded_early(event):
        lines.append(raid_attendance_copy.RECORDED_EARLY)
    lines.append(_COUNTED_LINES[event.attendance_counted])
    ordered = in_card_order(marks)
    if len(ordered) > PLAYER_MENUS * MENU_SIZE:
        lines.append(raid_attendance_copy.MENU_CAPPED)
    lines.append("")
    groups = [
        f"{raid_attendance_copy.group_heading(outcome, len(players))} {_names(players)}"
        for outcome, players in grouped(ordered)
    ]
    lines += groups or [raid_attendance_copy.NOBODY_LISTED]
    rows = [*_player_menus(event, ordered), action_row(_add_menu(event))]
    rows.append(action_row(_count_toggle(event), _export(event)))
    return lines, rows


def _player_menus(event: WowRaidEvent, ordered: Sequence[WowRaidAttendance]) -> list[dict[str, Any]]:
    """Up to ``PLAYER_MENUS`` menus of ``MENU_SIZE`` players in the card's order, numbered when there are more."""
    chunks = [ordered[start : start + MENU_SIZE] for start in range(0, len(ordered), MENU_SIZE)][:PLAYER_MENUS]
    menus = []
    for index, chunk in enumerate(chunks):
        placeholder = raid_attendance_copy.PLAYER_MENU
        if len(chunks) > 1:
            first = index * MENU_SIZE + 1
            placeholder = raid_attendance_copy.player_menu(first, first + len(chunk) - 1)
        menu = {
            "type": COMPONENT_TYPE_STRING_SELECT,
            "custom_id": raid_custom_id.attendance(event.id, "who", arg=str(index + 1)),
            "placeholder": placeholder,
            "min_values": 1,
            "max_values": 1,
            "options": [_player_option(mark) for mark in chunk],
        }
        menus.append(action_row(menu))
    return menus


def _player_option(mark: WowRaidAttendance) -> dict[str, Any]:
    """Their name over their outcome.  An option shows no markdown, so the name goes in as it is."""
    return {
        "label": shown_name(mark)[:_OPTION_CHARS],
        "value": mark.discord_user_id,
        "description": raid_attendance_copy.OUTCOME_LABELS[mark.outcome],
    }


def _add_menu(event: WowRaidEvent) -> dict[str, Any]:
    """Add people who came without signing up (members of the server, up to ``ADD_MAX`` a pick)."""
    return {
        "type": COMPONENT_TYPE_USER_SELECT,
        "custom_id": raid_custom_id.attendance(event.id, "add"),
        "placeholder": raid_attendance_copy.ADD_MENU,
        "min_values": 1,
        "max_values": ADD_MAX,
    }


def _count_toggle(event: WowRaidEvent) -> dict[str, Any]:
    if event.attendance_counted:
        nocount = raid_custom_id.attendance(event.id, "nocount")
        return button(raid_attendance_copy.NO_COUNT, BUTTON_STYLE_SECONDARY, nocount)
    return button(raid_attendance_copy.COUNT, BUTTON_STYLE_SECONDARY, raid_custom_id.attendance(event.id, "count"))


def _export(event: WowRaidEvent) -> dict[str, Any]:
    return button(raid_attendance_copy.EXPORT, BUTTON_STYLE_SECONDARY, raid_custom_id.attendance(event.id, "csv"))


def _source(mark: WowRaidAttendance) -> list[str]:
    """Where their outcome came from: their sign-up, or the leader who added them; then who last changed it.

    A leader's change overwrites who marked the row, so once someone a
    leader added is changed, the card says only that a leader added them.
    """
    lines: list[str] = []
    if mark.signup_status is not None:
        lines.append(raid_attendance_copy.signed_as(mark.signup_status))
    by, at = mark.marked_by_user_id, mark.marked_at
    if by is None or at is None:
        return lines
    if mark.signup_status is None and at == mark.created_at:
        return [raid_attendance_copy.added_by(by, unix(at))]
    if mark.signup_status is None:
        lines.append(raid_attendance_copy.WALK_IN)
    lines.append(raid_attendance_copy.changed_by(by, unix(at)))
    return lines


def _names(marks: Sequence[WowRaidAttendance]) -> str:
    return ", ".join(escape_name(shown_name(mark)) for mark in marks)


# ---------------------------------------------------------------------------
# /raid attendance and /raid-admin attendance
# ---------------------------------------------------------------------------


def history_card(window: Window, query: WindowQuery, *, member: str, own: bool) -> dict[str, Any]:
    """*member*'s raids in the window, newest first (``HISTORY_LINES`` of them), under how many they made.

    *own* when it's the member asking (/raid attendance): 'You made …'.
    """
    raids = len(window.raids)
    if not raids:
        return ephemeral_data(raid_attendance_copy.NO_COUNTED_RAIDS)
    stats, lines = history(window.raids, window.marks, bench=query.bench)
    if stats is None and own:
        return ephemeral_data(raid_attendance_copy.no_history_self(raids))
    if stats is None:
        return ephemeral_data(raid_attendance_copy.no_history_other(member, raids))
    head = raid_attendance_copy.history_head_other(member, stats, unix(stats.first_at), raids)
    if own:
        head = raid_attendance_copy.history_head_self(stats, unix(stats.first_at), raids)
    shown, older = capped(lines)
    body = [
        raid_attendance_copy.history_line(unix(line.event.starts_at), title_text(line.event), line.outcome)
        for line in shown
    ]
    if older:
        body.append(raid_attendance_copy.history_more(older))
    embed = {
        "title": raid_attendance_copy.summary_title(raids, _raid_label(query)),
        "description": clip_lines("\n".join([head, "", *body]), EMBED_DESCRIPTION_LIMIT),
        "color": COLOR_OPEN,
    }
    return ephemeral_data("", embeds=[embed])


def summary_card(window: Window, query: WindowQuery, page: int) -> dict[str, Any]:
    """Every player over the window, best first, ``PAGE_SIZE`` a page, with [Previous] [Next] and [Export CSV]."""
    raids = len(window.raids)
    if not raids:
        return ephemeral_data(raid_attendance_copy.NO_COUNTED_RAIDS)
    stats = summarize(window.raids, window.marks, bench=query.bench)
    shown, page, pages = page_of(stats, page)
    lines = [raid_attendance_copy.summary_line(player, escape_name(player.name)) for player in shown]
    if not lines:
        lines = [raid_attendance_copy.NOBODY_LISTED]
    description = "\n".join([raid_attendance_copy.summary_sub(query.bench), "", *lines])
    embed = {
        "title": raid_attendance_copy.summary_title(raids, _raid_label(query)),
        "description": clip_lines(description, EMBED_DESCRIPTION_LIMIT),
        "color": COLOR_OPEN,
        "footer": {"text": raid_attendance_copy.page_footer(page, pages, len(stats))},
    }
    buttons = [button(raid_attendance_copy.EXPORT, BUTTON_STYLE_SECONDARY, raid_custom_id.summary("csv", query))]
    if pages > 1:
        buttons[:0] = _pager(query, page, pages)
    return ephemeral_data("", components=[action_row(*buttons)], embeds=[embed])


def _pager(query: WindowQuery, page: int, pages: int) -> list[dict[str, Any]]:
    """[Previous] [Next]; at either end that one is greyed out (pointing at its own page, so no two ids clash)."""
    last = min(pages, MANAGE_MAX_PAGE)
    back = raid_custom_id.summary("page", query, str(max(page - 1, 1)))
    ahead = raid_custom_id.summary("page", query, str(min(page + 1, last)))
    return [
        button(raid_attendance_copy.PREVIOUS, BUTTON_STYLE_SECONDARY, back, disabled=page == 1),
        button(raid_attendance_copy.NEXT, BUTTON_STYLE_SECONDARY, ahead, disabled=page >= last),
    ]


def _raid_label(query: WindowQuery) -> str | None:
    if query.raid_key is None:
        return None
    return raid_name(query.raid_key)
