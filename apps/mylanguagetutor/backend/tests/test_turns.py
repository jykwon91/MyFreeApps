"""POST /sessions/{id}/turns -- the SSE conversation turn, with a fake Claude.

Covers the event contract (order + payloads), the partial/complete/failed
settlement paths and their quota effects, and every pre-stream refusal
(which must happen BEFORE Claude is called).

Turn settlement runs in its own ``unit_of_work`` (separate connection), so
assertions about persisted state read through a fresh engine rather than the
test's ``db`` session (whose identity map would serve stale objects).
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import anthropic
import httpx2
import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.tutor import quota_service, turn_service
from app.services.tutor.turn_slots import turn_slots

_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _overloaded() -> anthropic.APIStatusError:
    response = httpx2.Response(529, request=_REQUEST)
    body = {"type": "error", "error": {"type": "overloaded_error", "message": "busy"}}
    return anthropic.InternalServerError("busy", response=response, body=body)


def _auth_error() -> anthropic.APIStatusError:
    response = httpx2.Response(401, request=_REQUEST)
    body = {"type": "error", "error": {"type": "authentication_error", "message": "no"}}
    return anthropic.AuthenticationError("no", response=response, body=body)


def _parse_sse(body: str) -> list[tuple[str, Any]]:
    events: list[tuple[str, Any]] = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        name = None
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("event:"):
                name = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data_lines.append(line[len("data:"):].strip())
        if name is not None:
            events.append((name, json.loads("\n".join(data_lines)) if data_lines else None))
    return events


async def _fetch(sql: str, **params: Any) -> list[Any]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            return list((await conn.execute(text(sql), params)).all())
    finally:
        await engine.dispose()


async def _bucket(bucket: str) -> int:
    rows = await _fetch(
        "SELECT COALESCE(SUM(count), 0) FROM daily_usage_counters WHERE bucket = :b", b=bucket,
    )
    return int(rows[0][0])


async def _new_session(authed: AsyncClient, scenario: str = "cafe", level: str = "beginner") -> str:
    resp = await authed.post(
        "/sessions", json={"language_code": "es", "scenario_slug": scenario, "level": level},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _turn(authed: AsyncClient, session_id: str, text_value: str = "hola, quiero un cafe"):
    return await authed.post(f"/sessions/{session_id}/turns", json={"text": text_value})


def _names(events: list[tuple[str, Any]]) -> list[str]:
    return [name for name, _ in events]


def _expected_units(fake) -> int:
    # reply 100 + 5*20 = 200; corrections 2 x (200 + 5*50) = 900; translation 50 + 5*10 = 100
    return 200 + 900 + 100


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_event_order_and_payloads(self, user_factory, as_user, fake_claude) -> None:
        fake_claude.corrections_json = json.dumps(
            {
                "corrections": [
                    {
                        "error_span": "un cafe",
                        "corrected_span": "un café",
                        "full_corrected_sentence": "Hola, quiero un café.",
                        "error_type": "lexical",
                        "severity": "minor",
                        "feedback_move": "recast",
                        "explanation": "Small slip.",
                    }
                ],
                "retry_prompt": None,
                "goals_met_this_turn": [0],
            }
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)

        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/event-stream")
        events = _parse_sse(resp.text)
        assert _names(events) == [
            "turn.started", "reply.delta", "reply.delta", "reply.done", "corrections", "done",
        ]
        started = events[0][1]
        assert started["seq"] == 1
        assert "".join(e[1]["text"] for e in events if e[0] == "reply.delta") == (
            "¡Hola! ¿Qué quieres tomar?"
        )
        corrections = events[4][1]
        assert corrections["items"][0]["corrected_span"] == "un café"
        assert corrections["scenario_state"] == {"goals_met": [0], "complete": False}
        assert corrections["translation"] == "Hi! What would you like to drink?"
        done = events[5][1]
        assert done["status"] == "complete"
        assert 0.0 < done["usage"]["remaining_fraction"] < 1.0
        assert set(done["usage"]) == {"remaining_fraction"}

        rows = await _fetch(
            "SELECT status, reply_text IS NOT NULL, cost_units, input_tokens, output_tokens "
            "FROM tutor_turn WHERE id = :id",
            id=uuid.UUID(started["turn_id"]),
        )
        assert rows[0][0] == "complete"
        assert rows[0][1] is True
        assert rows[0][2] == _expected_units(fake_claude)
        assert rows[0][3] == 100 + 200 + 50
        assert rows[0][4] == 20 + 50 + 10
        count = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=uuid.UUID(session_id))
        assert count[0][0] == 1

    @pytest.mark.asyncio
    async def test_quota_reconciles_to_actual_usage(self, user_factory, as_user, fake_claude) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        assert resp.status_code == 200
        expected = _expected_units(fake_claude)
        assert await _bucket(quota_service.user_bucket(uuid.UUID(user["id"]))) == expected
        assert await _bucket(quota_service.GLOBAL_BUCKET) == expected

    @pytest.mark.asyncio
    async def test_models_come_from_settings(self, user_factory, as_user, fake_claude, monkeypatch) -> None:
        monkeypatch.setattr(settings, "ltutor_reply_model", "reply-model-x")
        monkeypatch.setattr(settings, "ltutor_corrections_model", "corrections-model-y")
        monkeypatch.setattr(settings, "ltutor_translation_model", "translation-model-z")
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            await _turn(authed, session_id)
        assert fake_claude.stream_calls[0]["model"] == "reply-model-x"
        models = {call["model"] for call in fake_claude.create_calls}
        assert models == {"corrections-model-y", "translation-model-z"}

    @pytest.mark.asyncio
    async def test_second_turn_replays_history_and_carries_goals(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            fake_claude.corrections_json = (
                '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": [0]}'
            )
            await _turn(authed, session_id, "hola")
            fake_claude.corrections_json = (
                '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": [1]}'
            )
            resp = await _turn(authed, session_id, "un cafe por favor")

        events = _parse_sse(resp.text)
        assert events[0][1]["seq"] == 2
        corrections = dict(events)["corrections"]
        assert corrections["scenario_state"]["goals_met"] == [0, 1]
        second_reply = fake_claude.stream_calls[1]["messages"]
        assert [m["role"] for m in second_reply] == ["user", "assistant", "user"]
        assert second_reply[0]["content"] == "hola"

    @pytest.mark.asyncio
    async def test_corrections_failure_degrades_to_empty(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        fake_claude.corrections_json = "not json at all"
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        events = _parse_sse(resp.text)
        corrections = dict(events)["corrections"]
        assert corrections["items"] == []
        assert dict(events)["done"]["status"] == "complete"


class TestFailurePaths:
    @pytest.mark.asyncio
    async def test_pre_token_upstream_error_refunds_everything(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        fake_claude.reply_error = _overloaded()
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)

        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        assert _names(events) == ["turn.started", "error", "done"]
        assert events[1][1] == {"code": "tutor_busy", "retryable": True}
        assert events[2][1]["status"] == "failed"
        assert await _bucket(quota_service.user_bucket(uuid.UUID(user["id"]))) == 0
        assert await _bucket(quota_service.GLOBAL_BUCKET) == 0
        count = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=uuid.UUID(session_id))
        assert count[0][0] == 0
        status = await _fetch(
            "SELECT status FROM tutor_turn WHERE id = :id", id=uuid.UUID(events[0][1]["turn_id"]),
        )
        assert status[0][0] == "failed"

    @pytest.mark.asyncio
    async def test_misconfigured_key_is_not_retryable(self, user_factory, as_user, fake_claude) -> None:
        fake_claude.reply_error = _auth_error()
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        events = _parse_sse(resp.text)
        assert dict(events)["error"] == {"code": "tutor_misconfigured", "retryable": False}

    @pytest.mark.asyncio
    async def test_mid_stream_failure_is_partial_and_keeps_the_reservation(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        fake_claude.reply_error = anthropic.APIConnectionError(request=_REQUEST)
        fake_claude.reply_error_after = 1
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)

        events = _parse_sse(resp.text)
        assert _names(events) == ["turn.started", "reply.delta", "error", "done"]
        assert events[3][1]["status"] == "partial"
        turn_id = uuid.UUID(events[0][1]["turn_id"])
        rows = await _fetch("SELECT status, reply_text, cost_units FROM tutor_turn WHERE id = :id", id=turn_id)
        status, reply_text, cost_units = rows[0]
        assert status == "partial"
        # The partial reply is kept (encrypted at rest -- never plaintext).
        assert reply_text is not None and "Hola" not in reply_text
        # Tokens were generated but not counted -> the whole reservation is kept.
        user_units = await _bucket(quota_service.user_bucket(uuid.UUID(user["id"])))
        assert user_units == cost_units
        assert user_units > _expected_units(fake_claude)

    @pytest.mark.asyncio
    async def test_empty_reply_is_an_error(self, user_factory, as_user, fake_claude) -> None:
        fake_claude.reply_chunks = []
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        events = _parse_sse(resp.text)
        assert _names(events) == ["turn.started", "error", "done"]
        assert events[2][1]["status"] == "failed"


class TestClientDisconnect:
    @pytest.mark.asyncio
    async def test_abandoned_stream_settles_partial_without_refund(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """A learner closing the tab mid-reply: the generator is closed after
        the first delta; ``finally`` settles the turn and keeps the quota."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        stream = turn_service.stream_turn(prepared)
        assert (await stream.__anext__()).name == "turn.started"
        assert (await stream.__anext__()).name == "reply.delta"
        await stream.aclose()

        rows = await _fetch("SELECT status, cost_units FROM tutor_turn WHERE id = :id", id=prepared.turn_id)
        assert rows[0][0] == "partial"
        assert rows[0][1] == prepared.reservation.units
        assert await _bucket(quota_service.user_bucket(user_id)) == prepared.reservation.units


class TestRefusedBeforeClaude:
    @pytest.mark.asyncio
    async def test_other_users_session_is_404(self, user_factory, as_user, fake_claude) -> None:
        owner = await user_factory()
        intruder = await user_factory()
        async with await as_user(owner) as authed:
            session_id = await _new_session(authed)
        async with await as_user(intruder) as authed:
            resp = await _turn(authed, session_id)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "session_not_found"
        assert fake_claude.calls == 0

    @pytest.mark.asyncio
    async def test_user_cap_is_429_before_claude(
        self, user_factory, as_user, fake_claude, monkeypatch,
    ) -> None:
        monkeypatch.setattr(settings, "ltutor_user_daily_units", 10)
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        assert resp.status_code == 429
        assert resp.json()["detail"] == "daily_limit_reached"
        assert fake_claude.calls == 0
        turns = await _fetch("SELECT count(*) FROM tutor_turn WHERE session_id = :id", id=uuid.UUID(session_id))
        assert turns[0][0] == 0
        assert await _bucket(quota_service.GLOBAL_BUCKET) == 0

    @pytest.mark.asyncio
    async def test_global_cap_is_503(self, user_factory, as_user, fake_claude, monkeypatch) -> None:
        monkeypatch.setattr(settings, "ltutor_global_daily_units", 10)
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        assert resp.status_code == 503
        assert resp.json()["detail"] == "tutor_unavailable"
        assert fake_claude.calls == 0
        # The user reservation rolled back with the refused global one.
        assert await _bucket(quota_service.user_bucket(uuid.UUID(user["id"]))) == 0

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("setting", "value"),
        [("ltutor_global_daily_units", 0), ("anthropic_api_key", "")],
    )
    async def test_kill_switch_is_503(
        self, user_factory, as_user, fake_claude, monkeypatch, setting: str, value: object,
    ) -> None:
        monkeypatch.setattr(settings, setting, value)
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)
        assert resp.status_code == 503
        assert resp.json()["detail"] == "tutor_unavailable"
        assert fake_claude.calls == 0

    @pytest.mark.asyncio
    async def test_ended_session_is_409(self, user_factory, as_user, fake_claude) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            assert (await authed.post(f"/sessions/{session_id}/end")).status_code == 200
            resp = await _turn(authed, session_id)
        assert resp.status_code == 409
        assert resp.json()["detail"] == "session_ended"
        assert fake_claude.calls == 0

    @pytest.mark.asyncio
    async def test_session_turn_limit_is_409(
        self, user_factory, as_user, fake_claude, monkeypatch,
    ) -> None:
        monkeypatch.setattr(settings, "ltutor_max_turns_per_session", 1)
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            assert (await _turn(authed, session_id)).status_code == 200
            resp = await _turn(authed, session_id)
        assert resp.status_code == 409
        assert resp.json()["detail"] == "session_turn_limit"

    @pytest.mark.asyncio
    async def test_one_turn_in_flight_per_user(self, user_factory, as_user, fake_claude) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            turn_slots.try_acquire(uuid.UUID(user["id"]))
            resp = await _turn(authed, session_id)
        assert resp.status_code == 429
        assert resp.json()["detail"] == "turn_in_progress"
        assert fake_claude.calls == 0

    @pytest.mark.asyncio
    async def test_slot_is_released_after_the_turn(self, user_factory, as_user, fake_claude) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            assert (await _turn(authed, session_id)).status_code == 200
            assert (await _turn(authed, session_id)).status_code == 200

    @pytest.mark.asyncio
    @pytest.mark.parametrize("bad_text", ["", "   ", "x" * 501])
    async def test_text_validation(self, user_factory, as_user, fake_claude, bad_text: str) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id, bad_text)
        assert resp.status_code == 422
        assert fake_claude.calls == 0

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.post(f"/sessions/{uuid.uuid4()}/turns", json={"text": "hola"})
        assert resp.status_code == 401
