"""Helpers for Manage sign-ups flows: a posted raid, sign-ups and taps on the cards.

Sign-ups a test starts from are written straight to the repository.  Each
tap carries the card it was made on (*on*), as Discord sends it, so the
player's name rides along in the card's author line.  Built on
``discord_raid_harness.py``.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.wow.raid_catalog import spec_info

from discord_raid_harness import (
    CHANNEL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    click,
    content,
    create_and_post,
    pick_user,
    setup_guild,
)

RAID_NAME = "Onyxia's Lair"
POST_LINK = f"https://discord.com/channels/{GUILD}/{CHANNEL}/m1"


async def posted_raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted five-player raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


async def sign_up(
    db: AsyncSession, event: WowRaidEvent, user_id: str, name: str, choice: str, status: str = "confirmed"
) -> None:
    """*user_id* signed up as *choice* ('mage.frost')."""
    wow_class, spec_key = choice.split(".")
    spec = spec_info(wow_class, spec_key)
    assert spec is not None
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=user_id,
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=spec.raid_role,
        spec=spec_key,
    )


async def fill_seats(db: AsyncSession, event: WowRaidEvent, count: int) -> None:
    """*count* Frost Mages with seats."""
    for n in range(count):
        await sign_up(db, event, f"30000000000000010{n}", f"Mage{n}", "mage.frost")


async def signup_row(db: AsyncSession, event: WowRaidEvent, user_id: str) -> WowRaidSignup | None:
    row = await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id=user_id)
    if row is not None:
        await db.refresh(row)
    return row


async def place_in_line(db: AsyncSession, event: WowRaidEvent, user_id: str, when: datetime) -> None:
    """Date *user_id*'s sign-up *when* (the order every list goes by)."""
    row = await signup_row(db, event, user_id)
    assert row is not None
    row.signed_up_at = when
    await db.flush()


def ml(event: WowRaidEvent, verb: str, member: str = "-", arg: str = "-") -> str:
    return f"raid:v1:ml:{event.id}:{verb}:{member}:{arg}"


def tap(
    event: WowRaidEvent,
    verb: str,
    member: str = "-",
    arg: str = "-",
    *,
    on: dict[str, Any] | None = None,
    values: list[str] | None = None,
    user_id: str = ORGANISER,
    permissions: int = ORGANISER_PERMS,
) -> dict[str, Any]:
    """A tap on a Manage sign-ups card — by the organiser unless said otherwise — made on the card *on*."""
    message = None
    if on is not None:
        message = on["data"]
    custom_id = ml(event, verb, member, arg)
    return click(custom_id, user_id=user_id, permissions=permissions, values=values, message=message)


def pick(event: WowRaidEvent, picked_id: str, name: str, **kwargs: Any) -> dict[str, Any]:
    """A member picked in the hub's menu."""
    return pick_user(ml(event, "who"), picked_id, picked_name=name, **kwargs)


async def review_card(post: Post, event: WowRaidEvent, picked_id: str, name: str, choice: str) -> dict[str, Any]:
    """Pick *picked_id* on the hub, then the class and spec of *choice*: the review card."""
    spec = spec_info(*choice.split("."))
    assert spec is not None
    card = await post(pick(event, picked_id, name))
    specs = await post(tap(event, "class", picked_id, on=card, values=[spec.column]))
    return await post(tap(event, "spec", picked_id, spec.column, on=specs, values=[choice]))


def card_embed(response: dict[str, Any]) -> dict[str, Any]:
    [embed] = response["data"]["embeds"]
    return embed


def card_description(response: dict[str, Any]) -> str:
    return card_embed(response)["description"]


def card_lines(response: dict[str, Any]) -> list[str]:
    return content(response).split("\n")


def starts_unix(event: WowRaidEvent) -> int:
    return int(event.starts_at.timestamp())


def raid_line_of(event: WowRaidEvent) -> str:
    return f"**{RAID_NAME}** · <t:{starts_unix(event)}:F>"


def post_now(fake_discord: FakeDiscord) -> str:
    """The public post as last re-rendered."""
    edits = fake_discord.public_edits()
    assert edits, "the post wasn't re-rendered"
    return json.dumps(edits[-1].body, ensure_ascii=False)
