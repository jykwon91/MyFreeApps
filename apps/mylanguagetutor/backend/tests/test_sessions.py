"""Tutor session CRUD, tenant isolation, data export, and deletion cascade.

Style mirrors apps/myrecipes/backend/tests/test_recipes.py: register fresh users
via ``user_factory``, act through ``as_user`` clients, assert cross-user access
is a 404 (no existence leak). Runs against a real Postgres in CI; deleting the
user cascades every tutor row.
"""
from __future__ import annotations

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.testing.factories import _FastPasswordHelper

from app.domain.turn_status import TurnStatus
from app.models.tutor.tutor_session import TutorSession
from app.models.tutor.tutor_turn import TutorTurn
from app.repositories.tutor import tutor_turn_repository


def _payload(**overrides: str) -> dict[str, str]:
    body = {"language_code": "es", "scenario_slug": "cafe", "level": "beginner"}
    body.update(overrides)
    return body


async def _add_turn(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    seq: int,
    learner_text: str,
    status: TurnStatus = TurnStatus.COMPLETE,
) -> TutorTurn:
    turn = await tutor_turn_repository.create(
        db,
        TutorTurn(
            session_id=uuid.UUID(session_id),
            user_id=uuid.UUID(user_id),
            seq=seq,
            learner_text=learner_text,
            reply_text=f"reply {seq}" if status == TurnStatus.COMPLETE else None,
            corrections_json=json.dumps([{"from": "quiero un cafe", "to": "quiero un café"}])
            if status == TurnStatus.COMPLETE
            else None,
            status=status.value,
        ),
    )
    await db.commit()
    return turn


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_create_returns_201(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/sessions", json=_payload())
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["language_code"] == "es"
        assert body["scenario_slug"] == "cafe"
        assert body["level"] == "beginner"
        assert body["status"] == "active"
        assert body["turn_count"] == 0
        assert body["ended_at"] is None
        assert "user_id" not in body

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "override",
        [
            {"language_code": "fr"},
            {"scenario_slug": "not-a-scenario"},
            {"level": "expert"},
        ],
    )
    async def test_rejects_values_outside_registries(
        self, user_factory, as_user, override: dict[str, str],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/sessions", json=_payload(**override))
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_rejects_client_supplied_user_id(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/sessions", json={**_payload(), "user_id": str(uuid.uuid4())},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.post("/sessions", json=_payload())).status_code == 401

    @pytest.mark.asyncio
    async def test_unverified_user_is_rejected(self, user_factory, as_user) -> None:
        """Router-level current_active_user requires a verified account; an
        unverified user can't even obtain a token."""
        user = await user_factory(verified=False)
        with pytest.raises(AssertionError, match="Login failed"):
            await as_user(user)


class TestListSessions:
    @pytest.mark.asyncio
    async def test_newest_first_and_paginated(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            ids = []
            for slug in ("greetings", "cafe", "paying"):
                resp = await authed.post("/sessions", json=_payload(scenario_slug=slug))
                assert resp.status_code == 201
                ids.append(resp.json()["id"])

            full = (await authed.get("/sessions")).json()
            page = (await authed.get("/sessions", params={"limit": 2, "offset": 1})).json()

        assert full["total"] == 3
        assert [s["id"] for s in full["items"]] == list(reversed(ids))
        assert page["total"] == 3
        assert page["limit"] == 2 and page["offset"] == 1
        assert [s["id"] for s in page["items"]] == list(reversed(ids))[1:3]

    @pytest.mark.asyncio
    async def test_only_own_sessions(self, user_factory, as_user) -> None:
        alice = await user_factory()
        bob = await user_factory()
        async with await as_user(alice) as a:
            await a.post("/sessions", json=_payload())
        async with await as_user(bob) as b:
            resp = await b.get("/sessions")
        assert resp.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


class TestGetSession:
    @pytest.mark.asyncio
    async def test_includes_turns_ordered_by_seq(
        self, user_factory, as_user, db: AsyncSession,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = (await authed.post("/sessions", json=_payload())).json()["id"]
            # Insert out of order to prove the read orders by seq.
            await _add_turn(db, session_id=session_id, user_id=user["id"], seq=2,
                            learner_text="Me da un café, por favor")
            await _add_turn(db, session_id=session_id, user_id=user["id"], seq=1,
                            learner_text="Hola")
            await _add_turn(db, session_id=session_id, user_id=user["id"], seq=3,
                            learner_text="¿Cuánto", status=TurnStatus.PARTIAL)
            resp = await authed.get(f"/sessions/{session_id}")

        assert resp.status_code == 200, resp.text
        turns = resp.json()["turns"]
        assert [t["seq"] for t in turns] == [1, 2, 3]
        assert turns[0]["learner_text"] == "Hola"
        assert turns[1]["corrections"] == [{"from": "quiero un cafe", "to": "quiero un café"}]
        assert turns[2]["status"] == "partial"
        assert turns[2]["reply_text"] is None

    @pytest.mark.asyncio
    async def test_transcript_is_encrypted_at_rest(
        self, user_factory, as_user, db: AsyncSession,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = (await authed.post("/sessions", json=_payload())).json()["id"]
        await _add_turn(db, session_id=session_id, user_id=user["id"], seq=1,
                        learner_text="Soy de Texas")
        raw = (
            await db.execute(
                text("SELECT learner_text FROM tutor_turn WHERE session_id = :sid"),
                {"sid": session_id},
            )
        ).scalar_one()
        assert "Texas" not in raw

    @pytest.mark.asyncio
    async def test_other_users_session_is_404(self, user_factory, as_user) -> None:
        alice = await user_factory()
        bob = await user_factory()
        async with await as_user(alice) as a:
            session_id = (await a.post("/sessions", json=_payload())).json()["id"]
        async with await as_user(bob) as b:
            assert (await b.get(f"/sessions/{session_id}")).status_code == 404
            assert (await b.post(f"/sessions/{session_id}/end")).status_code == 404
            assert (await b.delete(f"/sessions/{session_id}")).status_code == 404
        # Still intact for the owner.
        async with await as_user(alice) as a:
            resp = await a.get(f"/sessions/{session_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_missing_session_is_404(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            assert (await authed.get(f"/sessions/{uuid.uuid4()}")).status_code == 404


class TestEndAndDelete:
    @pytest.mark.asyncio
    async def test_end_is_idempotent(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = (await authed.post("/sessions", json=_payload())).json()["id"]
            first = await authed.post(f"/sessions/{session_id}/end")
            second = await authed.post(f"/sessions/{session_id}/end")
        assert first.status_code == 200, first.text
        assert first.json()["status"] == "ended"
        assert first.json()["ended_at"] is not None
        assert second.json()["ended_at"] == first.json()["ended_at"]

    @pytest.mark.asyncio
    async def test_delete_removes_session_and_turns(
        self, user_factory, as_user, db: AsyncSession,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = (await authed.post("/sessions", json=_payload())).json()["id"]
            await _add_turn(db, session_id=session_id, user_id=user["id"], seq=1,
                            learner_text="Hola")
            resp = await authed.delete(f"/sessions/{session_id}")
            assert resp.status_code == 204
            assert (await authed.get(f"/sessions/{session_id}")).status_code == 404
        remaining = (
            await db.execute(
                select(func.count()).select_from(TutorTurn).where(
                    TutorTurn.session_id == uuid.UUID(session_id),
                )
            )
        ).scalar_one()
        assert remaining == 0


class TestAccountDataLifecycle:
    @pytest.mark.asyncio
    async def test_export_includes_sessions_and_turns(
        self, user_factory, as_user, db: AsyncSession,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = (await authed.post("/sessions", json=_payload())).json()["id"]
            await _add_turn(db, session_id=session_id, user_id=user["id"], seq=1,
                            learner_text="Quiero un café")
            resp = await authed.get("/users/me/export")

        assert resp.status_code == 200, resp.text
        export = resp.json()
        assert "hashed_password" not in json.dumps(export)
        sessions = export["tutor_sessions"]
        assert [s["id"] for s in sessions] == [session_id]
        assert sessions[0]["turns"][0]["learner_text"] == "Quiero un café"

    @pytest.mark.asyncio
    async def test_export_excludes_other_users_sessions(
        self, user_factory, as_user,
    ) -> None:
        alice = await user_factory()
        bob = await user_factory()
        async with await as_user(alice) as a:
            await a.post("/sessions", json=_payload())
        async with await as_user(bob) as b:
            export = (await b.get("/users/me/export")).json()
        assert export["tutor_sessions"] == []

    @pytest.mark.asyncio
    async def test_account_deletion_cascades_tutor_rows(
        self, user_factory, as_user, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # The shared deletion router bound the real PasswordHelper at import,
        # before the test factories swapped in the fast hasher that
        # user_factory registered with. Point it at the same hasher so the
        # real password is still verified (MBK / MJH patch the same symbol).
        monkeypatch.setattr(
            "platform_shared.api.account_deletion_router.PasswordHelper",
            _FastPasswordHelper,
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = (await authed.post("/sessions", json=_payload())).json()["id"]
            await _add_turn(db, session_id=session_id, user_id=user["id"], seq=1,
                            learner_text="Adiós")
            resp = await authed.request(
                "DELETE",
                "/users/me",
                json={"password": user["password"], "confirm_email": user["email"]},
            )
        assert resp.status_code == 204, resp.text

        user_id = uuid.UUID(user["id"])
        sessions_left = (
            await db.execute(
                select(func.count()).select_from(TutorSession).where(
                    TutorSession.user_id == user_id,
                )
            )
        ).scalar_one()
        turns_left = (
            await db.execute(
                select(func.count()).select_from(TutorTurn).where(
                    TutorTurn.user_id == user_id,
                )
            )
        ).scalar_one()
        assert sessions_left == 0
        assert turns_left == 0
