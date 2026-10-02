"""Raid: Edit — change a raid from its post's right-click menu.

Right-click a raid post → Apps → **Raid: Edit**.  Only the raid's leader
or someone with Manage Events gets the card (type 4); every button, menu
and form checks again, since a card can sit open while things change.

Flows
-----
* **Title / Date & Time / Description / Image** — a form (type 9) holding
  what's there now.  Its submit saves under the row lock and answers with
  the card again (type 7) saying what changed, or why nothing did; the
  post is re-rendered in the background.  A move reschedules the raid's
  reminders and, while anyone is on the raid, the card offers
  [Tell them in channel] (``raid_leader``: a ping with the new time).
* **Role limits / Class limits** — a form: a box per role, or a class per
  line (``raid_limit_forms``).  Whatever reads is saved and the rest is
  reported on the card; a limit set below the players already in line
  removes nobody, and the card says so.
* **Deadline** — a form: how long before the start sign-ups close ("2h",
  "1d 6h"; empty = at the start).  One that has passed closes them now.
* **Notes: off / Notes: on** — members may leave the leader a note, or
  not; the card comes back saying which (the post doesn't change).  The
  button names the state it switches to, so a card that sat open says
  "already" instead of flipping notes back.
* **Leader / Color** — a menu in place of the card, with [Back].  A leader
  who hands the raid to someone else gets a closing note instead of the
  card when they can't edit it any more.
* **Cancel raid** — a form for the reason, then the usual cancel check
  (``raid_admin.handle_cancel``); its [Keep raid] comes back here.
* **Delete raid** — a check, then the raid, its sign-ups and its pending
  reminders go at once (nobody is told) and the post is removed in the
  background; the card says whether that worked.
* **Done** — the card closes.

A raid that's cancelled or finished can only be deleted.

Create preview → More options
-----------------------------
``/raid-admin create``'s preview offers [More options]: the same buttons,
forms and menus on the draft, answering with the draft's card (the post as
it will look, a button per thing to change) instead of the edit card, plus
**Mentions** — the roles the raid pings, or [No ping].  [Back] there goes
back to the preview; a draft has no public post to re-render.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import MENTION_EVERYONE
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_draft_copy, raid_limit_copy, raid_member_copy, raid_publisher
from app.services.discord.interaction import (
    Interaction,
    ephemeral_data,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import RaidContext, load_led_event, load_led_post, may_lead, utcnow
from app.services.discord.raid_deadline_copy import deadline_notice, moved_notice
from app.services.discord.raid_draft_views import MENTION_MAX, mentions_picker, options_data, preview_data
from app.services.discord.raid_edit_views import (
    FIELD,
    cancel_modal,
    class_limits_modal,
    color_picker,
    deadline_modal,
    delete_check,
    description_modal,
    edit_card,
    image_modal,
    leader_picker,
    role_limits_modal,
    title_modal,
    when_modal,
)
from app.services.discord.raid_views import cancel_confirm_data, unix
from app.services.wow import raid_event_service, raid_extras_rules
from app.services.wow.raid_colors import COLORS_BY_KEY, stored_value
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_details import (
    clean_description,
    clean_reason,
    clean_title,
    image_link,
    mention_pick,
    mention_roles,
    server_ping_roles,
    stored_title,
)
from app.services.wow.raid_limit_forms import read_class_form, read_role_form
from app.services.wow.raid_limits import LimitHit, Limits, changed_keys, over_limit
from app.services.wow.raid_roster import listed_user_ids
from app.services.wow.raid_text import escape_name
from app.services.wow.raid_time_parser import RaidTimeError, parse_raid_time

# A posted raid in any state: one that's over can still be deleted.
_POSTED: Final = ("scheduled", "cancelled", "completed")
# What the card's buttons open on: a posted raid, or a draft's More options.
_OPENABLE: Final = ("draft", *_POSTED)
# What the forms and menus change: a raid still on, or a draft.
_CHANGEABLE: Final = ("draft", "scheduled")
# The create preview's buttons; a posted raid's card answers them with itself.
_DRAFT_ONLY: Final = ("more", "preview", "mentions", "noping")
# What the card's buttons change under the row lock.
_LOCKED: Final = ("keep", "noping", "notes_on", "notes_off")
# What a draft doesn't offer: [Cancel] on the preview throws it away instead.
_POSTED_ONLY: Final = ("cancel", "delete", "keep", "done")


@dataclass(frozen=True)
class _Saved:
    """What a form's submit shows, and whether the post needs re-rendering."""

    card: dict[str, Any]
    refresh: bool = True


# A form's submit: what its boxes hold, by custom_id.
_Apply = Callable[[AsyncSession, RaidContext, Mapping[str, str]], Awaitable[_Saved]]


# ---------------------------------------------------------------------------
# The menu command
# ---------------------------------------------------------------------------


async def handle_edit_menu(interaction: Interaction, background: BackgroundTasks) -> dict[str, Any]:
    async with unit_of_work() as db:
        found = await load_led_post(db, interaction, lock=False)
        if isinstance(found, str):
            return ephemeral_response(found)
        return message_response(edit_card(found.event))


# ---------------------------------------------------------------------------
# The card's buttons
# ---------------------------------------------------------------------------


async def handle_edit_button(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    action = parsed.args[0]
    if action == "done":
        return update_text_response(raid_copy.EDIT_SAVED)
    async with unit_of_work() as db:
        found = await load_led_event(
            db, interaction, parsed.event_id, lock=action in _LOCKED, statuses=_OPENABLE
        )
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        if action in ("notes_on", "notes_off") and event.status in _CHANGEABLE:
            enabled = action == "notes_on"
            changed = await raid_event_service.set_signup_notes_enabled(db, event, enabled)
            return update_response(_card(found, notice=raid_member_copy.notes_toggled(enabled, changed)))
        if event.status == "draft":
            if action == "noping":
                await raid_event_service.set_mentions(db, event, [])
                return update_response(_card(found, notice=raid_draft_copy.MENTIONS_NONE))
            return _open_draft(action, found)
        if action == "delete":
            signups = await wow_raid_signup_repo.list_for_event(db, event.id)
            return update_response(delete_check(event, len(signups)))
        if event.status != "scheduled":
            return update_response(edit_card(event))
        if action == "keep":
            # Drop the reason staged by the cancel form, so a later cancel doesn't reuse it.
            await raid_event_service.set_cancel_reason(db, event, None)
            return update_response(edit_card(event, notice=raid_copy.CANCEL_KEPT))
        if action in _DRAFT_ONLY:
            return update_response(edit_card(event))
        return _open(action, found)


def _open_draft(action: str, found: RaidContext) -> dict[str, Any]:
    """The create preview's More options: the preview, the draft's card, or what a button there opens."""
    if action == "preview":
        return update_response(preview_data(found.event, found.guild, emojis=emojis.current()))
    if action == "mentions":
        return update_response(mentions_picker(found.event, found.guild))
    if action in _POSTED_ONLY:
        return update_response(_card(found))
    return _open(action, found)


def _card(found: RaidContext, *, notice: str | None = None, notify_count: int = 0) -> dict[str, Any]:
    """Where a change lands: the draft's card under the create preview, else the edit card."""
    if found.event.status == "draft":
        return options_data(found.event, found.guild, emojis=emojis.current(), notice=notice)
    return edit_card(found.event, notice=notice, notify_count=notify_count)


def _has_post(found: RaidContext) -> bool:
    """A posted raid's post shows a change; a draft has none to re-render yet."""
    return found.event.status != "draft"


def _open(action: str, found: RaidContext) -> dict[str, Any]:
    """What a property button opens: a form, a menu, or (``back``) the card."""
    event = found.event
    if action == "title":
        return title_modal(event)
    if action == "when":
        return when_modal(event, found.guild.timezone)
    if action == "deadline":
        return deadline_modal(event)
    if action == "desc":
        return description_modal(event)
    if action == "image":
        return image_modal(event)
    if action == "cancel":
        return cancel_modal(event)
    if action == "role_limits":
        return role_limits_modal(event)
    if action == "class_limits":
        return class_limits_modal(event)
    if action == "leader":
        return update_response(leader_picker(event))
    if action == "color":
        return update_response(color_picker(event))
    return update_response(_card(found))


# ---------------------------------------------------------------------------
# Leader and Color menus
# ---------------------------------------------------------------------------


async def handle_pick(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    picker = parsed.args[0]
    # Mentions may be emptied (no ping); the leader and color menus always send one.
    if not interaction.values and picker != "mentions":
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_CHANGEABLE)
        if isinstance(found, str):
            return update_text_response(found)
        if picker == "mentions":
            saved = await _pick_mentions(db, interaction, found)
        elif picker == "leader":
            saved = await _pick_leader(db, interaction, found, interaction.values[0])
        else:
            saved = await _pick_color(db, found, interaction.values[0])
        refresh = saved.refresh and _has_post(found)
    if refresh:
        background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    return update_response(saved.card)


async def _pick_leader(db: AsyncSession, interaction: Interaction, found: RaidContext, user_id: str) -> _Saved:
    event = found.event
    if interaction.resolved_is_bot(user_id):
        return _Saved(leader_picker(event, notice=raid_copy.LEADER_BOT), refresh=False)
    name = interaction.resolved_display_name(user_id)
    await raid_event_service.set_leader(db, event, user_id=user_id, display_name=name)
    if not may_lead(interaction, event):
        return _Saved(ephemeral_data(raid_copy.handed_over(escape_name(name)), embeds=[]))
    return _Saved(_card(found, notice=raid_copy.leader_ok(escape_name(name))))


async def _pick_color(db: AsyncSession, found: RaidContext, key: str) -> _Saved:
    event = found.event
    color = COLORS_BY_KEY.get(key)
    if color is None:
        return _Saved(color_picker(event), refresh=False)
    await raid_event_service.set_color(db, event, stored_value(color))
    notice = raid_copy.COLOR_OK
    if event.closed_at is not None:
        notice = raid_copy.COLOR_OK_CLOSED
    return _Saved(_card(found, notice=notice))


async def _pick_mentions(db: AsyncSession, interaction: Interaction, found: RaidContext) -> _Saved:
    """Who the raid pings: the roles picked, as far as the picker may ping them; nobody when emptied."""
    event = found.event
    if event.status != "draft":
        # A menu left open after posting: the ping has gone out.
        return _Saved(_card(found), refresh=False)
    resolved = {role_id: interaction.resolved_role(role_id) for role_id in interaction.values}
    pick = mention_pick(
        interaction.values,
        mentionable={role_id: role.get("mentionable") is True for role_id, role in resolved.items() if role},
        everyone_id=interaction.guild_id,
        allowed=[*mention_roles(event, found.guild), *server_ping_roles(found.guild)],
        may_ping_any=interaction.has_permission(MENTION_EVERYONE),
        limit=MENTION_MAX,
    )
    notes: list[str] = []
    if pick.everyone:
        notes.append(raid_draft_copy.EVERYONE_LEFT_OUT)
    if pick.left_out:
        notes.append(raid_draft_copy.mentions_left_out(pick.left_out))
    if interaction.values and not pick.roles:
        # Nothing picked can be pinged: the raid keeps the roles it had.
        notice = " ".join([raid_draft_copy.NOTHING_CHANGED, *notes])
        return _Saved(mentions_picker(event, found.guild, notice=notice), refresh=False)
    await raid_event_service.set_mentions(db, event, pick.roles)
    if pick.muted:
        notes.append(raid_draft_copy.mentions_heads_up(pick.muted))
    done = raid_draft_copy.MENTIONS_OK
    if not pick.roles:
        done = raid_draft_copy.MENTIONS_NONE
    return _Saved(_card(found, notice=" ".join([done, *notes])), refresh=False)


# ---------------------------------------------------------------------------
# The forms' submits
# ---------------------------------------------------------------------------


async def handle_title_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_title)


async def handle_when_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_when)


async def handle_deadline_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_deadline)


async def handle_description_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_description)


async def handle_image_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_image)


async def handle_cancel_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_cancel)


async def handle_role_limits_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_role_limits)


async def handle_class_limits_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    return await _submit(interaction, parsed, background, _apply_class_limits)


async def _submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks, apply: _Apply
) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_CHANGEABLE)
        if isinstance(found, str):
            return update_text_response(found)
        saved = await apply(db, found, interaction.fields)
        refresh = saved.refresh and _has_post(found)
    if refresh:
        background.add_task(raid_publisher.refresh_public_message, parsed.event_id)
    return update_response(saved.card)


def _box(fields: Mapping[str, str]) -> str:
    """A one-box form's box."""
    return fields.get(FIELD, "")


async def _apply_title(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    event = found.event
    title = clean_title(_box(fields))
    if not title:
        return _Saved(_card(found, notice=raid_copy.TITLE_EMPTY), refresh=False)
    await raid_event_service.set_title(db, event, stored_title(event.raid_key, title))
    return _Saved(_card(found, notice=raid_copy.TITLE_OK))


async def _apply_when(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    event = found.event
    now = utcnow()
    try:
        starts_at = parse_raid_time(_box(fields), tz_name=found.guild.timezone, now=now)
    except RaidTimeError as exc:
        return _Saved(_card(found, notice=exc.user_message), refresh=False)
    if starts_at == event.starts_at:
        return _Saved(_card(found, notice=raid_copy.WHEN_SAME), refresh=False)
    outcome = await raid_event_service.edit_event(
        db, event=event, guild=found.guild, starts_at=starts_at, size_cap=None, notes=None, now=now
    )
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    notice = moved_notice(raid_copy.moved(unix(starts_at)), outcome.deadline)
    return _Saved(_card(found, notice=notice, notify_count=len(listed_user_ids(signups))))


async def _apply_deadline(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    saved = await raid_event_service.set_signup_deadline(db, found.event, _box(fields), now=utcnow())
    return _Saved(_card(found, notice=deadline_notice(saved)), refresh=saved.changed)


async def _apply_description(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    notes = clean_description(_box(fields))
    await raid_event_service.set_description(db, found.event, notes)
    notice = raid_copy.DESC_OK
    if notes is None:
        notice = raid_copy.DESC_CLEARED
    return _Saved(_card(found, notice=notice))


async def _apply_image(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    try:
        link = image_link(_box(fields))
    except ValueError:
        return _Saved(_card(found, notice=raid_copy.BANNER_BAD), refresh=False)
    await raid_event_service.set_banner(db, found.event, link)
    notice = raid_copy.BANNER_OK
    if link is None:
        notice = raid_copy.BANNER_RESET
    return _Saved(_card(found, notice=notice))


async def _apply_cancel(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    """Stage the reason and ask once more; [Cancel raid] there does the cancelling."""
    await raid_event_service.set_cancel_reason(db, found.event, clean_reason(_box(fields)))
    return _Saved(cancel_confirm_data(found.event, from_edit=True), refresh=False)


async def _apply_role_limits(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    old = dict(Limits.of(found.event).roles)
    form = read_role_form(fields, old)
    over: list[LimitHit] = []
    if form.limits != old:
        await raid_event_service.set_role_limits(db, found.event, form.limits)
        over = await _past_limits(db, found, changed_keys(old, form.limits))
    notice = raid_limit_copy.role_notice(old, form.limits, form.bad, over)
    return _Saved(_card(found, notice=notice), refresh=form.limits != old)


async def _apply_class_limits(db: AsyncSession, found: RaidContext, fields: Mapping[str, str]) -> _Saved:
    if FIELD not in fields:  # no box came back; an empty one clears the limits
        return _Saved(_card(found, notice=raid_draft_copy.NOTHING_CHANGED), refresh=False)
    old = dict(Limits.of(found.event).classes)
    form = read_class_form(fields[FIELD], old)
    over: list[LimitHit] = []
    if form.limits != old:
        await raid_event_service.set_class_limits(db, found.event, form.limits)
        over = await _past_limits(db, found, changed_keys(old, form.limits))
    notice = raid_limit_copy.class_notice(old, form.limits, form.errors, over)
    return _Saved(_card(found, notice=notice), refresh=form.limits != old)


async def _past_limits(db: AsyncSession, found: RaidContext, keys: Iterable[str]) -> list[LimitHit]:
    """Of the limits named by *keys*, those the players in line are already past (nobody is removed)."""
    signups = await wow_raid_signup_repo.list_for_event(db, found.event.id)
    return over_limit(signups, Limits.of(found.event), keys)


# ---------------------------------------------------------------------------
# [Delete raid] on the delete check
# ---------------------------------------------------------------------------


async def handle_delete(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_POSTED)
        if isinstance(found, str):
            return update_text_response(found)
        channel_id = found.event.channel_id
        message_id = found.event.message_id
        leftovers = raid_extras_rules.leftovers(found.guild, found.event)
        await raid_event_service.delete_event(db, found.event)
    background.add_task(
        raid_publisher.delete_post, channel_id, message_id, interaction.application_id, interaction.token, leftovers
    )
    return update_text_response(raid_copy.DELETING)
