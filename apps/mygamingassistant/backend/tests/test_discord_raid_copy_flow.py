"""End-to-end flows for Copy raid — Raid: Edit → [Copy raid].

The button, its form and the draft copy it makes, through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.
From the preview on, the copy is the create flow's draft: here [Post raid]
only shows that a copy posts like any other.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_event_repo, wow_raid_signup_repo
from app.services.discord import raid_copy, raid_draft_copy, raid_repeat_copy
from app.services.discord.components import raid_duplicate
from app.services.discord.raid_edit_views import when_prefill
from app.services.wow.raid_time_parser import PAST_MESSAGE, UNREADABLE_MESSAGE

from discord_raid_harness import (
    CHANNEL,
    NY,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    content,
    create_and_post,
    custom_ids,
    future_when,
    modal_submit,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_TZ = "America/New_York"
_COPIER = {"user_id": "402", "permissions": MANAGE_EVENTS, "display": "Sylvanas"}
_RAID_ROLE = "600000000000000002"


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


def _copy(event: WowRaidEvent, **as_who: Any) -> dict[str, Any]:
    """[Copy raid] on the raid's edit card — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:cp:{event.id}", **as_who)


def _copy_form(event: WowRaidEvent, when: str, **as_who: Any) -> dict[str, Any]:
    """The Copy raid form's submit."""
    return modal_submit(f"raid:v1:m:{event.id}:copy", {"value": when}, **as_who)


def _prefill(response: dict[str, Any]) -> str:
    return response["data"]["components"][0]["component"]["value"]


async def _drafts(db: AsyncSession) -> list[WowRaidEvent]:
    return list((await db.execute(select(WowRaidEvent).where(WowRaidEvent.status == "draft"))).scalars())


async def test_copy_raid_makes_a_draft_with_the_raids_settings_and_nobody_on_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event.title = "Ony speedrun"
    event.leader_user_id, event.leader_display_name = "401", "Jaina"
    event.image_url = "https://i.imgur.com/raid.png"
    event.color = 0x3366FF
    event.mention_role_ids = [_RAID_ROLE]
    event.role_limits = {"tank": 1}
    event.class_limits = {"mage": 2}
    event.signup_deadline_minutes = 120
    event.signup_notes_enabled = True
    # Its state, none of which a copy keeps.
    event.closed_at = event.last_pinged_at = datetime.now(timezone.utc)
    event.close_reason = "leader"
    await db.flush()
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="501", display_name="Player501", status="confirmed",
        wow_class="mage", role="dps", spec="frost",
    )
    # It repeats; its copy doesn't.
    await post(click(f"raid:v1:rp:{event.id}:every", user_id=ORGANISER, permissions=ORGANISER_PERMS, values=["7"]))
    assert event.series_id is not None

    # --- the form: the raid's time a week on
    response = await post(_copy(event))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:copy"
    assert response["data"]["title"] == raid_repeat_copy.COPY_MODAL
    week_on = datetime.combine(event.starts_at.astimezone(NY).date() + timedelta(days=7), time(20, 0), tzinfo=NY)
    assert _prefill(response) == when_prefill(week_on, _TZ)

    # --- submitted by another manager: a draft on the create preview; nothing sent yet
    new_when = future_when(days=20)
    new_start = datetime.strptime(new_when, "%Y-%m-%d %H:%M").replace(tzinfo=NY)
    response = await post(_copy_form(event, new_when, **_COPIER))
    assert response["type"] == 7
    (draft,) = await _drafts(db)
    intro = raid_draft_copy.preview_intro(CHANNEL, [_RAID_ROLE])
    assert content(response) == f"{raid_repeat_copy.copied('Ony speedrun')}\n\n{intro}"
    assert custom_ids(response) == [
        f"raid:v1:confirm:{draft.id}", f"raid:v1:ed:{draft.id}:more", f"raid:v1:discard:{draft.id}"
    ]
    assert fake_discord.calls == []
    for name in wow_raid_event_repo.COPIED:
        assert getattr(draft, name) == getattr(event, name), name
    assert (draft.guild_id, draft.starts_at, draft.channel_id, draft.message_id) == (
        event.guild_id, new_start, CHANNEL, None
    )
    assert (draft.created_by_user_id, draft.created_by_display_name) == ("402", "Sylvanas")
    assert (draft.closed_at, draft.close_reason, draft.last_pinged_at, draft.series_id) == (None, None, None, None)
    signups = (await db.execute(select(WowRaidSignup).where(WowRaidSignup.event_id == draft.id))).scalars()
    assert list(signups) == []
    await db.refresh(event)
    assert (event.status, event.message_id) == ("scheduled", "m1")

    # --- [Post raid]: it posts like any new raid
    response = await post(click(f"raid:v1:confirm:{draft.id}", **_COPIER))
    assert response["type"] == 7
    (public_post,) = fake_discord.channel_posts()
    assert public_post.body is not None
    assert public_post.body["content"] == f"<@&{_RAID_ROLE}>"
    await db.refresh(draft)
    assert (draft.status, draft.message_id) == ("scheduled", "m2")


async def test_an_old_raid_is_suggested_on_its_next_weekday_to_come(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    event.starts_at = datetime(2026, 9, 1, 20, 0, tzinfo=NY)  # a Tuesday
    await wow_raid_event_repo.mark_completed(db, event)
    # Friday 2 October: the Tuesdays between have passed.
    monkeypatch.setattr(raid_duplicate, "utcnow", lambda: datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc))

    response = await post(_copy(event))
    assert response["type"] == 9
    assert _prefill(response) == when_prefill(datetime(2026, 10, 6, 20, 0, tzinfo=NY), _TZ)


@pytest.mark.parametrize(("when", "notice"), [("whenever", UNREADABLE_MESSAGE), ("1/1/2020 8pm", PAST_MESSAGE)])
async def test_a_time_that_wont_do_shows_the_edit_card_saying_why(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, when: str, notice: str
) -> None:
    event = await _raid(post, db, fake_discord)
    response = await post(_copy_form(event, when))
    assert response["type"] == 7
    assert content(response) == notice
    assert response["data"]["embeds"][0]["title"] == "Edit raid"
    assert f"raid:v1:cp:{event.id}" in custom_ids(response)
    assert await _drafts(db) == []
    assert fake_discord.calls == []


async def test_copying_needs_manage_events_even_for_the_raids_leader(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event.leader_user_id, event.leader_display_name = "401", "Jaina"
    await db.flush()

    leader = {"user_id": "401", "permissions": 0}
    for request in (_copy(event, **leader), _copy_form(event, future_when(days=20), **leader)):
        response = await post(request)
        assert_ephemeral(response)
        assert content(response) == raid_repeat_copy.NOT_PERMITTED_COPY
    assert await _drafts(db) == []
    assert fake_discord.calls == []


@pytest.mark.parametrize("over", ["cancelled", "completed"])
async def test_a_raid_that_is_over_can_be_copied(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, over: str
) -> None:
    event = await _raid(post, db, fake_discord)
    event.status = over
    await db.flush()

    response = await post(_copy(event))
    assert response["type"] == 9
    response = await post(_copy_form(event, future_when(days=20)))
    assert response["type"] == 7
    (draft,) = await _drafts(db)
    assert custom_ids(response)[0] == f"raid:v1:confirm:{draft.id}"
    # What the raid left unset stays unset: SQL NULL, not a JSON null its checks refuse.
    unset = select(func.count()).where(
        WowRaidEvent.id == draft.id, WowRaidEvent.mention_role_ids.is_(None), WowRaidEvent.role_limits.is_(None)
    )
    assert await db.scalar(unset) == 1

    # --- a draft isn't a raid to copy
    response = await post(_copy(draft))
    assert content(response) == raid_copy.NOT_FOUND
