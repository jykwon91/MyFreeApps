"""A raid's web page — a PURE function of (event, signups); no I/O, the clock passed in.

What the raid's Discord post shows (``raid_embed``), as data for the page at
``/wow-forever/raids/<web_id hex>`` (``FE/pages/WowRaidPage.tsx``).  It is
built from the post's own helpers, so the two can't disagree:

* the columns: each one with anyone in it, in the post's order, its players
  in line order with their order numbers, the late and the queue marked;
* the lists: Tentative, Bench and Absence;
* the role row: seat holders, or players in line against a role's limit;
* the colour: the leader's pick (purple by default) while sign-ups are open,
  grey once they close, the raid starts or it's cancelled;
* the banner: the raid's built-in art, served by this site.  Never the
  leader's own image link, which would hand every viewer's address to that
  host; none once the raid is cancelled.

``state`` reads the clock as the sign-up buttons do (``raid_context``): a raid
past its start or its deadline shows as started or closed before the sweep
gets to it.

Never on the page (``RaidPage``): Discord user ids, sign-up notes, the
leader's image link, role ids, or the id of who made or leads the raid.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.schemas.wow.raid_web import (
    RaidColumn,
    RaidEntry,
    RaidPage,
    RaidRoleCount,
    RaidState,
    RaidStatusList,
)
from app.services.wow.raid_banners import banner_path
from app.services.wow.raid_catalog import CLASSES_BY_KEY, column_icon, column_label, effective_spec, raid_name
from app.services.wow.raid_deadline import closes_at, deadline_due, is_started
from app.services.wow.raid_details import leader_name
from app.services.wow.raid_embed import COLOR_CLOSED, STATUS_LISTS, post_color
from app.services.wow.raid_icon_files import ICONS_VERSION
from app.services.wow.raid_limits import Limits, role_tally
from app.services.wow.raid_post_layout import NO_CLASS_COLUMN, NO_CLASS_LABEL, ROLE_ROW, post_columns, with_status
from app.services.wow.raid_roster import QUEUED_STATUS, compute_roster_summary, order_numbers
from app.services.wow.raid_text import display_title, shown_name
from app.services.wow.raid_web_text import description_segments

LATE_STATUS: Final = "late"
# A raid's own status that decides its page's state on its own.
_FINAL_STATES: Final[dict[str, RaidState]] = {"cancelled": "cancelled", "completed": "completed"}


def build_page(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], *, discord_url: str | None, now: datetime
) -> RaidPage:
    """The page of a posted raid (the service never builds one for a draft)."""
    state = page_state(event, now)
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    limits = Limits.of(event)
    return RaidPage(
        web_id=event.web_id,
        title=display_title(event),
        raid_key=event.raid_key,
        raid_name=raid_name(event.raid_key),
        leader_name=leader_name(event),
        starts_at=event.starts_at,
        closes_at=_closes_at(event, state),
        state=state,
        cancel_reason=_cancel_reason(event),
        size_cap=summary.size_cap,
        seats_taken=summary.seats_taken,
        late=summary.late_count,
        queued=summary.queued_count,
        color=_color(event, state),
        banner_url=_banner(event),
        discord_url=discord_url,
        description=description_segments(event.notes),
        roles=_roles(signups, limits),
        columns=_columns(signups, limits),
        lists=_lists(signups),
        icons_version=ICONS_VERSION,
    )


def page_state(event: WowRaidEvent, now: datetime) -> RaidState:
    """Cancelled or completed (its status), then started, then closed (swept or due), else open."""
    final = _FINAL_STATES.get(event.status)
    if final is not None:
        return final
    if is_started(event) or event.starts_at <= now:
        return "started"
    if event.closed_at is not None or deadline_due(event, now):
        return "closed"
    return "open"


def _closes_at(event: WowRaidEvent, state: RaidState) -> datetime | None:
    if state != "open":
        return None
    return closes_at(event)


def _cancel_reason(event: WowRaidEvent) -> str | None:
    if event.status != "cancelled":
        return None
    return event.cancel_reason


def _color(event: WowRaidEvent, state: RaidState) -> str:
    """The post's colour as "#rrggbb": grey unless sign-ups are open."""
    color = COLOR_CLOSED
    if state == "open":
        color = post_color(event)
    return f"#{color:06x}"


def _banner(event: WowRaidEvent) -> str | None:
    if event.status == "cancelled":
        return None
    return banner_path(event.raid_key)


def _roles(signups: Sequence[WowRaidSignup], limits: Limits) -> list[RaidRoleCount]:
    tally = role_tally(signups, limits)
    roles: list[RaidRoleCount] = []
    for role, label, icon in ROLE_ROW:
        count, limit = tally[role]
        roles.append(RaidRoleCount(role=role, label=label, icon=icon, count=count, limit=limit))
    return roles


def _columns(signups: Sequence[WowRaidSignup], limits: Limits) -> list[RaidColumn]:
    """Every column with anyone in it, in the post's order."""
    numbers = order_numbers(signups)
    columns: list[RaidColumn] = []
    for column, players in post_columns(signups).items():
        if not players:
            continue
        columns.append(
            RaidColumn(
                key=column,
                label=_column_label(column),
                icon=_column_icon(column),
                count=len(players),
                limit=limits.for_column(column),
                entries=[_entry(signup, numbers.get(signup.discord_user_id)) for signup in players],
            )
        )
    return columns


def _column_label(column: str) -> str:
    if column == NO_CLASS_COLUMN:
        return NO_CLASS_LABEL
    return column_label(column)


def _column_icon(column: str) -> str | None:
    if column == NO_CLASS_COLUMN:
        return None
    return column_icon(column)


def _lists(signups: Sequence[WowRaidSignup]) -> list[RaidStatusList]:
    """Tentative, Bench and Absence, each when anyone is on it; no order numbers off the line."""
    lists: list[RaidStatusList] = []
    for status, label, icon in STATUS_LISTS:
        players = with_status(signups, status)
        if players:
            entries = [_entry(signup, None) for signup in players]
            lists.append(RaidStatusList(status=status, label=label, icon=icon, entries=entries))
    return lists


def _entry(signup: WowRaidSignup, number: int | None) -> RaidEntry:
    """A player as the post shows them: the spec they show as (a pre-spec sign-up: its default), else the class."""
    entry = RaidEntry(
        id=signup.id,
        number=number,
        name=shown_name(signup),
        late=signup.status == LATE_STATUS,
        queued=signup.status == QUEUED_STATUS,
    )
    if signup.wow_class in CLASSES_BY_KEY:
        entry.wow_class = signup.wow_class
        entry.icon = signup.wow_class
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is not None:
        entry.spec = spec.full_label
        entry.icon = spec.icon
        entry.role_group = spec.display_role
    return entry
