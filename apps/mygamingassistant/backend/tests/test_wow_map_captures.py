"""WoW World Map captures — public list, operator import, and the deploy pack.

Covers:
  - GET /api/wow/map-captures is public (full-auth AND serve-only)
  - POST imports, upserts by capture_key, and never rolls a newer capture back
  - validation: subkind must fit the kind, coordinates stay on the map
  - serve-only has no import route
  - pack export → import mirrors the pack; an empty pack deletes nothing
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User
from app.services.wow import map_capture_service

URL = "/api/wow/map-captures"

WARLOCK_TRAINER = {
    "capture_key": "npc:906:service",
    "kind": "service",
    "subkind": "class_trainer",
    "tag": "warlock",
    "npc_id": 906,
    "name": "Maximillian Crowe",
    "title": "Warlock Trainer",
    "zone_id": 1429,
    "subzone": "Goldshire",
    "x": 44.4,
    "y": 66.2,
    "faction": "A",
    "captured_at": "2026-09-20T18:00:00Z",
}

QUEST_GIVER = {
    "capture_key": "npc:823:quest",
    "kind": "quest_giver",
    "subkind": "npc",
    "npc_id": 823,
    "name": "Deputy Willem",
    "zone_id": 1429,
    "subzone": "Northshire Abbey",
    "x": 48.2,
    "y": 42.0,
    "faction": "A",
    "quests": [{"id": 783, "title": "A Threat Within", "level": 1, "min_level": 1}],
    "captured_at": "2026-09-20T18:05:00Z",
}


@pytest_asyncio.fixture
async def operator_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    from fastapi_users.password import PasswordHelper

    email = "wow-captures-test@example.com"
    password = "testpassword123!"
    db.add(
        User(
            email=email,
            hashed_password=PasswordHelper().hash(password),
            is_verified=True,
            is_active=True,
        )
    )
    await db.flush()
    resp = await client.post(
        "/api/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


@pytest.mark.asyncio
async def test_list_is_public_and_empty_by_default(client: AsyncClient) -> None:
    resp = await client.get(URL)
    assert resp.status_code == 200
    assert resp.json() == {"captures": []}


@pytest.mark.asyncio
async def test_import_then_list(operator_client: AsyncClient) -> None:
    resp = await operator_client.post(URL, json={"captures": [WARLOCK_TRAINER, QUEST_GIVER]})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"created": 2, "updated": 0, "unchanged": 0}

    listed = (await operator_client.get(URL)).json()["captures"]
    by_key = {c["capture_key"]: c for c in listed}
    assert by_key["npc:906:service"]["tag"] == "warlock"
    assert by_key["npc:823:quest"]["quests"][0]["title"] == "A Threat Within"


@pytest.mark.asyncio
async def test_reimport_keeps_the_newest_capture(operator_client: AsyncClient) -> None:
    await operator_client.post(URL, json={"captures": [WARLOCK_TRAINER]})

    older = {**WARLOCK_TRAINER, "x": 10.0, "captured_at": "2026-09-01T00:00:00Z"}
    resp = await operator_client.post(URL, json={"captures": [older]})
    assert resp.json() == {"created": 0, "updated": 0, "unchanged": 1}

    newer = {**WARLOCK_TRAINER, "x": 45.0, "captured_at": "2026-09-22T00:00:00Z"}
    resp = await operator_client.post(URL, json={"captures": [newer]})
    assert resp.json() == {"created": 0, "updated": 1, "unchanged": 0}

    listed = (await operator_client.get(URL)).json()["captures"]
    assert listed[0]["x"] == 45.0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad",
    [
        {**WARLOCK_TRAINER, "subkind": "raid"},
        {**WARLOCK_TRAINER, "x": 101},
        {**WARLOCK_TRAINER, "faction": "X"},
        {**WARLOCK_TRAINER, "quests": [{"title": "Nope", "level": 1, "min_level": 1}]},
        {**WARLOCK_TRAINER, "unexpected": True},
    ],
)
async def test_import_rejects_invalid_records(operator_client: AsyncClient, bad: dict) -> None:
    resp = await operator_client.post(URL, json={"captures": [bad]})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_serve_only_lists_but_cannot_import(serve_only_client: AsyncClient) -> None:
    assert (await serve_only_client.get(URL)).status_code == 200
    resp = await serve_only_client.post(URL, json={"captures": [WARLOCK_TRAINER]})
    assert resp.status_code in (404, 405)


@pytest.fixture
def _uow_on_test_session(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    @asynccontextmanager
    async def _fake_uow():
        yield db

    monkeypatch.setattr(map_capture_service, "unit_of_work", _fake_uow)


@pytest.mark.asyncio
@pytest.mark.usefixtures("_uow_on_test_session")
async def test_pack_round_trip_mirrors_the_pack(db: AsyncSession, tmp_path: Path) -> None:
    pack = tmp_path / "pack.json"
    pack.write_text(json.dumps({"version": 1, "captures": [WARLOCK_TRAINER, QUEST_GIVER]}), encoding="utf-8")
    stats = await map_capture_service.import_pack(pack)
    assert (stats.created, stats.deleted) == (2, 0)

    # Re-exported, the pack round-trips unchanged.
    exported = tmp_path / "exported.json"
    assert await map_capture_service.export_pack(exported) == 2
    again = await map_capture_service.import_pack(exported)
    assert (again.created, again.updated, again.unchanged, again.deleted) == (0, 0, 2, 0)

    # A capture dropped from the pack is removed.
    pack.write_text(json.dumps({"version": 1, "captures": [QUEST_GIVER]}), encoding="utf-8")
    stats = await map_capture_service.import_pack(pack)
    assert stats.deleted == 1
    listed = await map_capture_service.list_captures(db)
    assert [c.capture_key for c in listed.captures] == ["npc:823:quest"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("_uow_on_test_session")
async def test_empty_pack_deletes_nothing(db: AsyncSession, tmp_path: Path) -> None:
    pack = tmp_path / "pack.json"
    pack.write_text(json.dumps({"version": 1, "captures": [WARLOCK_TRAINER]}), encoding="utf-8")
    await map_capture_service.import_pack(pack)

    pack.write_text(json.dumps({"version": 1, "captures": []}), encoding="utf-8")
    stats = await map_capture_service.import_pack(pack)
    assert stats.deleted == 0
    assert len((await map_capture_service.list_captures(db)).captures) == 1


def test_wrong_pack_version_is_refused(tmp_path: Path) -> None:
    pack = tmp_path / "pack.json"
    pack.write_text(json.dumps({"version": 99, "captures": []}), encoding="utf-8")
    with pytest.raises(map_capture_service.CapturePackError):
        map_capture_service.read_pack(pack)


def test_committed_pack_is_valid() -> None:
    map_capture_service.read_pack()
