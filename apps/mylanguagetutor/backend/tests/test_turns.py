"""POST /sessions/{id}/turns -- the SSE conversation turn, with a fake Claude.

Covers the event contract (order + payloads), the partial/complete/failed
settlement paths and their quota effects, and every pre-stream refusal
(which must happen BEFORE Claude is called).

Turn settlement runs in its own ``unit_of_work`` (separate connection), so
assertions about persisted state read through a fresh engine rather than the
test's ``db`` session (whose identity map would serve stale objects).
"""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from pathlib import Path
from typing import Any

import anthropic
import anyio
import httpx2
import pytest
from fastapi import routing as fastapi_routing
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app
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


async def _execute(sql: str, **params: Any) -> None:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql), params)
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

    @pytest.mark.asyncio
    async def test_whitespace_only_reply_is_failed_like_an_empty_reply(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        fake_claude.reply_chunks = [" ", "\n", "  "]
        # Corrections never finish, so only the reply call's usage is known.
        fake_claude.create_gate = asyncio.Event()
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            resp = await _turn(authed, session_id)

        events = _parse_sse(resp.text)
        assert [n for n in _names(events) if n != "reply.delta"] == ["turn.started", "error", "done"]
        assert dict(events)["error"] == {"code": "tutor_busy", "retryable": True}
        assert dict(events)["done"]["status"] == "failed"
        rows = await _fetch(
            "SELECT status, reply_text, cost_units FROM tutor_turn WHERE id = :id",
            id=uuid.UUID(events[0][1]["turn_id"]),
        )
        assert rows[0] == ("failed", None, 200)
        count = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=uuid.UUID(session_id))
        assert count[0][0] == 0
        # Only the reply call's reported usage (100 + 5*20) is charged; the
        # rest of the reservation is released.
        assert await _bucket(quota_service.user_bucket(uuid.UUID(user["id"]))) == 200
        assert await _bucket(quota_service.GLOBAL_BUCKET) == 200


class TestClientDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_before_the_reply_starts_refunds_everything(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """The learner left right after ``turn.started`` (web unmount abort, phone
        backgrounded): no reply was produced, so nothing is charged."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        assert await _bucket(quota_service.user_bucket(user_id)) == prepared.reservation.units
        stream = turn_service.stream_turn(prepared)
        assert (await stream.__anext__()).name == "turn.started"
        await stream.aclose()

        rows = await _fetch("SELECT status, cost_units FROM tutor_turn WHERE id = :id", id=prepared.turn_id)
        assert rows[0][0] == "failed"
        assert rows[0][1] == 0
        assert await _bucket(quota_service.user_bucket(user_id)) == 0
        assert await _bucket(quota_service.GLOBAL_BUCKET) == 0
        sessions = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=session_id)
        assert sessions[0][0] == 0

    @pytest.mark.asyncio
    async def test_disconnect_while_waiting_for_the_first_token_charges_only_known_usage(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """Cancelled (as Starlette does on disconnect) while the reply had not
        streamed a token yet: the turn fails and only the corrections call that
        already finished is charged -- the rest of the reservation is released."""
        fake_claude.reply_gate = asyncio.Event()
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        stream = turn_service.stream_turn(prepared)
        assert (await stream.__anext__()).name == "turn.started"
        waiting = asyncio.create_task(stream.__anext__())
        while not fake_claude.stream_calls or not fake_claude.create_calls:
            await asyncio.sleep(0)
        waiting.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiting

        corrections_units = 900  # 2 x (200 + 5*50), see _expected_units
        rows = await _fetch(
            "SELECT status, reply_text, cost_units FROM tutor_turn WHERE id = :id", id=prepared.turn_id,
        )
        assert rows[0][0] == "failed"
        assert rows[0][1] is None
        assert rows[0][2] == corrections_units
        assert await _bucket(quota_service.user_bucket(user_id)) == corrections_units
        assert await _bucket(quota_service.GLOBAL_BUCKET) == corrections_units
        sessions = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=session_id)
        assert sessions[0][0] == 0

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

    @pytest.mark.asyncio
    async def test_disconnect_after_reply_done_still_finishes_the_turn(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """The stream dropped while the corrections and translation were still being
        worked out (the phone backgrounded, the tab closed): the learner has the whole
        reply, so the turn finishes anyway. It is complete with its corrections and
        translation, the goal it met counts on the next turn, and only actual usage is
        charged, not the reservation."""
        fake_claude.create_gate = asyncio.Event()
        fake_claude.corrections_json = (
            '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": [0]}'
        )
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        stream = turn_service.stream_turn(prepared)
        names: list[str] = []
        scopes: list[anyio.CancelScope] = []

        async def read() -> None:
            async for event in stream:
                names.append(event.name)

        async def request() -> None:
            # FastAPI's SSE response reads the generator in a task group whose
            # scope it cancels when the client disconnects.
            async with anyio.create_task_group() as group:
                scopes.append(group.cancel_scope)
                group.start_soon(read)

        running = asyncio.create_task(request())
        while len(fake_claude.create_calls) < 2:
            await asyncio.sleep(0)
        assert names == ["turn.started", "reply.delta", "reply.delta", "reply.done"]
        # Sent: the server goes on to wait for the corrections, and the client goes away.
        scopes[0].cancel()
        await asyncio.sleep(0.05)
        # The request waits for the turn to finish; its calls were not cancelled with it.
        assert not running.done()
        rows = await _fetch("SELECT status FROM tutor_turn WHERE id = :id", id=prepared.turn_id)
        assert rows[0][0] == "partial"
        fake_claude.create_gate.set()
        await asyncio.wait_for(running, timeout=5)
        assert names == ["turn.started", "reply.delta", "reply.delta", "reply.done"]

        rows = await _fetch(
            "SELECT status, reply_text, corrections_json, translation_text, cost_units"
            " FROM tutor_turn WHERE id = :id",
            id=prepared.turn_id,
        )
        assert rows[0][0] == "complete"
        assert rows[0][1] is not None  # the reply, encrypted
        assert rows[0][2] is not None  # the corrections, encrypted
        assert rows[0][3] is not None  # the translation, encrypted
        expected = _expected_units(fake_claude)
        assert expected < prepared.reservation.units
        assert rows[0][4] == expected
        assert await _bucket(quota_service.user_bucket(user_id)) == expected
        assert await _bucket(quota_service.GLOBAL_BUCKET) == expected
        sessions = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=session_id)
        assert sessions[0][0] == 1

        fake_claude.create_gate = None
        fake_claude.corrections_json = (
            '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": [1]}'
        )
        async with await as_user(user) as authed:
            resp = await _turn(authed, str(session_id), "un cafe por favor")
        assert dict(_parse_sse(resp.text))["corrections"]["scenario_state"]["goals_met"] == [0, 1]

    @pytest.mark.asyncio
    async def test_a_turn_that_cannot_be_finished_after_its_reply_stays_complete_and_keeps_the_reservation(
        self, user_factory, as_user, fake_claude, monkeypatch, caplog,
    ) -> None:
        """An unexpected failure working out a delivered reply's corrections, with the
        client still there: the learner has the whole reply, so the stream ends with
        ``done`` (complete, no corrections) and the turn is complete and counted; its
        usage is unknown, so the reservation stays charged. Logged once."""

        async def broken_corrections(*_args: Any) -> None:
            raise RuntimeError("unexpected")

        monkeypatch.setattr(turn_service, "run_corrections", broken_corrections)
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))
            resp = await _turn(authed, str(session_id))

        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        assert _names(events) == ["turn.started", "reply.delta", "reply.delta", "reply.done", "done"]
        assert dict(events)["done"]["status"] == "complete"
        failures = [r for r in caplog.records if "could not be finished" in r.getMessage()]
        assert len(failures) == 1
        rows = await _fetch(
            "SELECT status, corrections_json, cost_units FROM tutor_turn WHERE id = :id",
            id=uuid.UUID(events[0][1]["turn_id"]),
        )
        assert rows[0][0] == "complete"
        assert rows[0][1] is None
        reserved = await _bucket(quota_service.user_bucket(user_id))
        assert reserved > _expected_units(fake_claude)
        assert rows[0][2] == reserved
        sessions = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=session_id)
        assert sessions[0][0] == 1

    @pytest.mark.asyncio
    async def test_disconnect_after_corrections_keeps_the_result_and_charges_actual_usage(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """The learner saw the corrections (and the goal they met ticked), then the
        stream dropped before ``done``: the turn keeps its corrections and translation,
        the goal stays met for the next turn, and only actual usage is charged."""
        fake_claude.corrections_json = (
            '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": [0]}'
        )
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        stream = turn_service.stream_turn(prepared)
        names = [(await stream.__anext__()).name for _ in range(5)]
        assert names == ["turn.started", "reply.delta", "reply.delta", "reply.done", "corrections"]
        await stream.aclose()

        rows = await _fetch(
            "SELECT status, corrections_json, translation_text, cost_units FROM tutor_turn WHERE id = :id",
            id=prepared.turn_id,
        )
        assert rows[0][0] == "complete"
        assert rows[0][1] is not None  # the corrections, encrypted
        assert rows[0][2] is not None  # the translation, encrypted
        expected = _expected_units(fake_claude)
        assert expected < prepared.reservation.units
        assert rows[0][3] == expected
        assert await _bucket(quota_service.user_bucket(user_id)) == expected
        assert await _bucket(quota_service.GLOBAL_BUCKET) == expected
        sessions = await _fetch("SELECT turn_count FROM tutor_session WHERE id = :id", id=session_id)
        assert sessions[0][0] == 1

        fake_claude.corrections_json = (
            '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": [1]}'
        )
        async with await as_user(user) as authed:
            resp = await _turn(authed, str(session_id), "un cafe por favor")
        assert dict(_parse_sse(resp.text))["corrections"]["scenario_state"]["goals_met"] == [0, 1]

    @pytest.mark.asyncio
    async def test_disconnect_while_reply_done_is_unsent_stays_partial(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """Closed as ``reply.done`` was handed over but before it went out: the client
        can't know the reply ended, so the turn stays partial, like the client shows it."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        stream = turn_service.stream_turn(prepared)
        for _ in range(3):
            await stream.__anext__()
        await stream.aclose()

        rows = await _fetch("SELECT status FROM tutor_turn WHERE id = :id", id=prepared.turn_id)
        assert rows[0][0] == "partial"


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


class _DroppableRequest:
    """POST /sessions/{id}/turns straight through the ASGI app (middleware and all),
    with the client's side of the connection under the test's control: it can stop
    reading (``stall``) and hang up (``disconnect``), which ``httpx`` can't do."""

    def __init__(self, session_id: uuid.UUID, authorization: str, *, stall: bool = False) -> None:
        body = json.dumps({"text": "hola"}).encode()
        self._body: bytes | None = body
        self._stall = stall
        self._hung_up = asyncio.Event()
        self.received = bytearray()
        self.scope: dict[str, Any] = {
            "type": "http",
            # uvicorn's spec version: Starlette then listens for the disconnect itself.
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": f"/sessions/{session_id}/turns",
            "raw_path": f"/sessions/{session_id}/turns".encode(),
            "root_path": "",
            "query_string": b"",
            "headers": [
                (b"host", b"test"),
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"authorization", authorization.encode()),
            ],
            "client": ("127.0.0.1", 50000),
            "server": ("test", 80),
        }

    def start(self) -> asyncio.Task[None]:
        return asyncio.create_task(app(self.scope, self._receive, self._send))

    def disconnect(self) -> None:
        self._hung_up.set()

    async def _receive(self) -> dict[str, Any]:
        if self._body is not None:
            body, self._body = self._body, None
            return {"type": "http.request", "body": body, "more_body": False}
        await self._hung_up.wait()
        return {"type": "http.disconnect"}

    async def _send(self, message: dict[str, Any]) -> None:
        if message["type"] != "http.response.body":
            return
        self.received.extend(message.get("body", b""))
        if self._stall:
            # A client that stopped reading: the server's writes back up until it hangs up.
            await self._hung_up.wait()


class TestDroppedRequest:
    @pytest.mark.asyncio
    async def test_a_request_dropped_after_its_reply_holds_the_turn_slot_until_the_turn_is_settled(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """The client hangs up after ``reply.done`` while the corrections are still
        being worked out: the request lives on until the turn is finished and settled
        (complete, with its corrections), holding the user's turn slot, then frees it."""
        fake_claude.create_gate = asyncio.Event()
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))
            authorization = authed.headers["Authorization"]

        request = _DroppableRequest(session_id, authorization)
        running = request.start()
        while b"event: reply.done" not in request.received or len(fake_claude.create_calls) < 2:
            await asyncio.sleep(0.01)
        request.disconnect()
        await asyncio.sleep(0.1)

        assert not running.done()
        assert not turn_slots.try_acquire(user_id)  # still held
        rows = await _fetch("SELECT status FROM tutor_turn WHERE session_id = :id", id=session_id)
        assert rows == [("partial",)]

        fake_claude.create_gate.set()
        await asyncio.wait_for(running, timeout=5)
        rows = await _fetch(
            "SELECT status, corrections_json, cost_units FROM tutor_turn WHERE session_id = :id",
            id=session_id,
        )
        assert rows[0][0] == "complete"
        assert rows[0][1] is not None
        assert rows[0][2] == _expected_units(fake_claude)
        assert turn_slots.try_acquire(user_id)  # freed
        turn_slots.release(user_id)

    @pytest.mark.asyncio
    async def test_a_request_dropped_while_its_writes_are_backed_up_is_settled_before_it_ends(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """A client that stopped reading mid-reply, then hung up: the stream is left
        waiting at a ``yield`` rather than cancelled mid-await. It is still closed and
        the turn settled before the request ends, not later by garbage collection."""
        fake_claude.reply_chunks = [f"palabra{i} " for i in range(12)]
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))
            authorization = authed.headers["Authorization"]

        request = _DroppableRequest(session_id, authorization, stall=True)
        running = request.start()
        while b"event: turn.started" not in request.received:
            await asyncio.sleep(0.01)
        await asyncio.sleep(0.1)
        request.disconnect()
        finished, _ = await asyncio.wait([running], timeout=5)
        assert finished
        # FastAPI's SSE response itself errors on this hang-up (its keep-alive task
        # writes to the stream it already closed); the turn is settled regardless.
        running.exception()

        rows = await _fetch("SELECT status, reply_text FROM tutor_turn WHERE session_id = :id", id=session_id)
        assert rows[0][0] == "partial"
        assert rows[0][1] is not None  # settled: a partial reply was stored


class TestTurnStillFinishing:
    @pytest.mark.asyncio
    async def test_a_turn_is_refused_while_the_last_one_is_finishing_after_its_client_left(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """The learner left after a reply and sends the next turn on a connection that
        reaches another worker, whose turn slot doesn't know the first is still being
        finished: the unsettled turn refuses it until it is settled."""
        fake_claude.create_gate = asyncio.Event()
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))

        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        stream = turn_service.stream_turn(prepared)
        for _ in range(4):
            await stream.__anext__()
        waiting = asyncio.create_task(stream.__anext__())
        while len(fake_claude.create_calls) < 2:
            await asyncio.sleep(0)
        waiting.cancel()
        await asyncio.sleep(0)

        async with await as_user(user) as authed:
            refused = await _turn(authed, str(session_id))
        assert refused.status_code == 429
        assert refused.json()["detail"] == "turn_in_progress"
        assert len(fake_claude.stream_calls) == 1

        fake_claude.create_gate.set()
        with pytest.raises(asyncio.CancelledError):
            await waiting
        fake_claude.create_gate = None
        async with await as_user(user) as authed:
            allowed = await _turn(authed, str(session_id))
        assert allowed.status_code == 200
        assert dict(_parse_sse(allowed.text))["done"]["status"] == "complete"

    @pytest.mark.asyncio
    async def test_a_turn_that_was_never_settled_stops_blocking_the_session_after_the_bound(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        async with await as_user(user) as authed:
            session_id = uuid.UUID(await _new_session(authed))
        # Prepared, then its settlement never ran (the process died).
        prepared = await turn_service.prepare_turn(user_id=user_id, session_id=session_id, text="hola")
        await _execute(
            "UPDATE tutor_turn SET created_at = now() - make_interval(secs => :age) WHERE id = :id",
            age=settings.ltutor_unsettled_turn_max_age_seconds + 1, id=prepared.turn_id,
        )

        async with await as_user(user) as authed:
            resp = await _turn(authed, str(session_id))
        assert resp.status_code == 200
        assert dict(_parse_sse(resp.text))["done"]["status"] == "complete"

    @pytest.mark.asyncio
    async def test_settled_turns_without_a_reply_do_not_block_the_session(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        """Every settled turn with no reply text is ``failed``, so it never looks unsettled."""
        fake_claude.reply_error = _overloaded()
        user = await user_factory()
        async with await as_user(user) as authed:
            session_id = await _new_session(authed)
            failed = await _turn(authed, session_id)
            assert dict(_parse_sse(failed.text))["done"]["status"] == "failed"
            fake_claude.reply_error = None
            resp = await _turn(authed, session_id)
        assert resp.status_code == 200
        assert dict(_parse_sse(resp.text))["done"]["status"] == "complete"


_TURN_REQUEST_CONSTANTS = Path(__file__).resolve().parents[2] / "api-client/src/constants/turnRequest.ts"


def test_the_stream_is_heard_from_more_often_than_a_resumed_client_gives_up() -> None:
    """While a turn's corrections are being worked out the stream is quiet but for
    FastAPI's keep-alive pings, and a client back from the background gives up after
    ``RESUMED_TURN_SILENCE_MS`` of silence. FastAPI has no public setting for the ping
    interval, so this pins its value to the client's copy of it."""
    source = _TURN_REQUEST_CONSTANTS.read_text()
    keepalive = re.search(r"TURN_STREAM_KEEPALIVE_MS = ([\d_]+);", source)
    silence = re.search(r"RESUMED_TURN_SILENCE_MS = TURN_STREAM_KEEPALIVE_MS \+ ([\d_]+);", source)
    assert keepalive is not None and silence is not None
    keepalive_ms = int(keepalive.group(1).replace("_", ""))
    assert fastapi_routing._PING_INTERVAL * 1000 == keepalive_ms
    assert int(silence.group(1).replace("_", "")) > 0
