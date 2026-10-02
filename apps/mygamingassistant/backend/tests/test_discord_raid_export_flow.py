"""Raid CSV exports end to end: [Export CSV] on the Attendance card and on the /raid-admin attendance summary,
/raid-admin export and its ``event`` autocomplete, through POST /discord/interactions.

An export answers 'thinking…' (type 5, private) and attaches its files to
that reply in the background: one multipart PATCH of @original.  The fake
Discord sees that call as its ``payload_json`` part; ``uploads`` keeps every
part of it.
"""
from __future__ import annotations

import csv
import io
import logging
import re
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.wow import wow_raid_guild_repo
from app.services.discord import raid_attendance_copy, raid_copy
from app.services.wow import raid_custom_id
from app.services.wow.raid_attendance import WindowQuery
from app.services.wow.raid_csv import RAID_COLUMNS, SUMMARY_COLUMNS

import discord_attendance_steps as steps
from discord_raid_harness import (
    APP_ID,
    CHANNEL,
    ORGANISER,
    ORGANISER_PERMS,
    TOKEN,
    FakeDiscord,
    Post,
    autocomplete,
    click,
    command,
    content,
)

pytestmark = pytest.mark.asyncio

Part = tuple[str | None, str | None, bytes]
_ORIGINAL = f"/webhooks/{APP_ID}/{TOKEN}/messages/@original"
_THINKING = {"type": 5, "data": {"flags": 64}}
_USER = RAID_COLUMNS.index("discord_user_id")


def _parts(request: httpx.Request) -> dict[str, Part]:
    """A multipart body's parts by name: (filename, content type, bytes)."""
    boundary = request.headers["content-type"].split("boundary=", 1)[1].encode()
    parts: dict[str, Part] = {}
    for chunk in request.content.split(b"--" + boundary)[1:-1]:
        head, _, body = chunk.removeprefix(b"\r\n").partition(b"\r\n\r\n")
        headers = dict(line.split(": ", 1) for line in head.decode().split("\r\n"))
        disposition = headers["Content-Disposition"]
        name = re.search(r'; name="([^"]*)"', disposition)
        filename = re.search(r'; filename="([^"]*)"', disposition)
        assert name is not None
        parts[name.group(1)] = (filename and filename.group(1), headers.get("Content-Type"), body.removesuffix(b"\r\n"))
    return parts


@pytest.fixture
def uploads(fake_discord: FakeDiscord) -> list[dict[str, Part]]:
    """Every multipart call's parts; the call itself reaches the fake Discord as its JSON part."""
    seen: list[dict[str, Part]] = []
    plain = fake_discord.handler

    def handler(request: httpx.Request) -> httpx.Response:
        if not request.headers.get("content-type", "").startswith("multipart/form-data"):
            return plain(request)
        parts = _parts(request)
        seen.append(parts)
        return plain(httpx.Request(request.method, request.url, content=parts["payload_json"][2]))

    fake_discord.handler = handler  # type: ignore[method-assign]
    return seen


def _files(parts: dict[str, Part]) -> dict[str, list[list[str]]]:
    """An upload's files by name, read back as CSV rows."""
    files = {}
    for key, (filename, content_type, data) in parts.items():
        if key.startswith("files["):
            assert filename is not None and content_type == "text/csv; charset=utf-8"
            assert data.startswith(b"\xef\xbb\xbf")
            files[filename] = list(csv.reader(io.StringIO(data.decode("utf-8-sig"), newline="")))
    return files


def _said(fake_discord: FakeDiscord) -> Any:
    return fake_discord.original_edits()[-1].body["content"]


def _today() -> str:
    return f"{steps.now():%Y-%m-%d}"


async def test_the_cards_export_attaches_the_raids_csv(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, uploads: list[dict[str, Part]]
) -> None:
    event = await steps.recorded(db, await steps.guild(post, db), signups={1: "confirmed", 2: "absence"})
    fake_discord.clear()

    assert await post(steps.at(event, "csv")) == _THINKING
    name = f"raid-onyxia-{event.starts_at:%Y-%m-%d}.csv"
    (edit,) = fake_discord.original_edits()
    assert edit.body == {
        "content": raid_attendance_copy.export_done_raid("Onyxia's Lair"),
        "allowed_mentions": {"parse": []},
        "attachments": [{"id": 0, "filename": name}],
    }
    (upload,) = uploads
    header, *rows = _files(upload)[name]
    assert header == list(RAID_COLUMNS)
    attendance = RAID_COLUMNS.index("attendance")
    assert {row[_USER]: row[attendance] for row in rows} == {steps.member(1): "attended", steps.member(2): "absent"}


async def test_raid_admin_export_sends_one_raid_or_the_window(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, uploads: list[dict[str, Part]]
) -> None:
    guild = await steps.guild(post, db)
    older = await steps.recorded(db, guild, hours_ago=31, signups={1: "confirmed", 2: "late"})
    newer = await steps.recorded(db, guild, hours_ago=8, raid_key="mc", signups={1: "confirmed"})
    summary, every_raid = f"attendance-{_today()}.csv", f"attendance-raids-{_today()}.csv"

    assert await post(command("raid-admin", "export", event=str(older.id))) == _THINKING
    assert list(_files(uploads[-1])) == [f"raid-onyxia-{older.starts_at:%Y-%m-%d}.csv"]

    assert await post(command("raid-admin", "export")) == _THINKING
    assert _said(fake_discord) == raid_attendance_copy.export_done_window(2)
    files = _files(uploads[-1])
    assert list(files) == [summary, every_raid]
    header, *players = files[summary]
    assert header == list(SUMMARY_COLUMNS)
    percent = SUMMARY_COLUMNS.index("percent")
    assert {row[0]: row[percent] for row in players} == {steps.member(1): "100", steps.member(2): "50"}
    raid_id = RAID_COLUMNS.index("raid_id")
    assert [row[raid_id] for row in files[every_raid][1:]] == [str(newer.id), str(older.id), str(older.id)]

    await post(command("raid-admin", "export", raids=1))
    assert {row[raid_id] for row in _files(uploads[-1])[every_raid][1:]} == {str(newer.id)}
    await post(command("raid-admin", "export", raid="onyxia"))
    assert {row[raid_id] for row in _files(uploads[-1])[every_raid][1:]} == {str(older.id)}


async def test_the_summarys_export_sends_its_windows_files(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, uploads: list[dict[str, Part]]
) -> None:
    await steps.recorded(db, await steps.guild(post, db), 3)
    export = raid_custom_id.summary("csv", WindowQuery(count=5, bench=True))

    assert await post(click(export, user_id=ORGANISER, permissions=ORGANISER_PERMS)) == _THINKING
    header, *players = _files(uploads[-1])[f"attendance-{_today()}.csv"]
    assert [row[0] for row in players] == [steps.member(n) for n in (1, 2, 3)]

    refused = await post(click(export, user_id=steps.member(5), permissions=0))
    assert content(refused) == raid_copy.NOT_PERMITTED_EVENTS
    assert len(uploads) == 1


async def test_a_refused_upload_says_so(
    post: Post,
    db: AsyncSession,
    fake_discord: FakeDiscord,
    uploads: list[dict[str, Part]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    event = await steps.recorded(db, await steps.guild(post, db), signups={1: "confirmed"})
    fake_discord.clear()
    fake_discord.fail("PATCH", _ORIGINAL, 403, 50013)  # no Attach Files in this channel
    caplog.set_level(logging.WARNING, logger="app.services.discord.raid_export")

    assert await post(steps.at(event, "csv")) == _THINKING
    upload, said = fake_discord.original_edits()
    assert upload.body["attachments"] == [{"id": 0, "filename": f"raid-onyxia-{event.starts_at:%Y-%m-%d}.csv"}]
    assert said.body["content"] == raid_attendance_copy.EXPORT_FAILED
    assert "upload refused status=403 code=50013" in caplog.text
    assert len(uploads) == 1


async def test_an_upload_discord_never_answers_says_so(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, uploads: list[dict[str, Part]]
) -> None:
    await steps.recorded(db, await steps.guild(post, db), 2)
    fake_discord.clear()
    fake_discord.time_out("PATCH", _ORIGINAL)

    assert await post(command("raid-admin", "export")) == _THINKING
    upload, said = fake_discord.original_edits()
    assert len(upload.body["attachments"]) == 2
    assert said.body["content"] == raid_attendance_copy.EXPORT_FAILED


async def test_an_export_with_nothing_to_send_or_no_right_to_says_why(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, uploads: list[dict[str, Part]]
) -> None:
    guild = await steps.guild(post, db)
    assert await post(command("raid-admin", "export")) == _THINKING
    assert _said(fake_discord) == raid_attendance_copy.EXPORT_NOTHING

    refused = await post(command("raid-admin", "export", user_id=steps.member(5), permissions=0))
    assert content(refused) == raid_copy.NOT_PERMITTED_EVENTS
    other = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="800000000000000009", raid_channel_id=CHANNEL)
    draft, theirs = await steps.raid(db, guild, status="draft"), await steps.raid(db, other)
    for raw in (str(draft.id), str(theirs.id), "not-a-raid"):
        assert content(await post(command("raid-admin", "export", event=raw))) == raid_copy.NOT_FOUND
    assert uploads == []


async def test_the_event_autocomplete_lists_raids_on_or_done_newest_first(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    done = await steps.raid(db, guild)
    on = await steps.raid(db, guild, hours_ago=-48, status="scheduled")
    await steps.raid(db, guild, hours_ago=-72, status="draft")
    await steps.raid(db, guild, hours_ago=-24, status="cancelled")

    response = await post(autocomplete("export", "event", ""))
    assert response["type"] == 8
    assert [choice["value"] for choice in response["data"]["choices"]] == [str(on.id), str(done.id)]
