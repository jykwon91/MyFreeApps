"""WoW "Ask" chat relay: gating order, body cap, transcript rules, tickets, token budgets.

Claude is never called (``chat_client._build_client`` is a fake); Turnstile is
never called (``verify_turnstile_token`` is patched when a test switches the
secret on). Quota rows land on the SAVEPOINT-bound test session.
"""
from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, patch

import anthropic
import httpx2
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.rate_limit import _BucketConfig
from platform_shared.repositories.daily_quota_repo import get_daily_usage, try_consume_daily_quota_amount

from app.api import wow_chat
from app.core.config import settings
from app.core.wow_chat_limits import GLOBAL_TOKEN_BUCKET, MAX_BODY_BYTES, TICKET_TTL_SECONDS
from app.services.wow.chat import chat_quota
from app.services.wow.chat.chat_keys import network_hash
from app.services.wow.chat.chat_quota import estimate_tokens, ip_bucket
from app.services.wow.chat.chat_ticket import issue_ticket

from wow_chat_helpers import (
    BUILD_CLIENT,
    QUESTION,
    URL,
    VERIFY_TURNSTILE,
    fake_client,
    reply,
    reset_limiters,
    status_error,
    text_block,
    tool_block,
    tool_reply,
    tool_results,
    usage,
    user_text,
)

LOCAL_IP = "127.0.0.1"


@pytest.fixture(autouse=True)
def _chat_on(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(settings, "wow_chat_daily_token_cap", 2_500_000)
    monkeypatch.setattr(settings, "wow_chat_ip_daily_token_cap", 250_000)
    reset_limiters()
    yield
    reset_limiters()


def _ticket(rounds_left: int = 3, *, ip: str = LOCAL_IP, digest: str = "0" * 64, now: float | None = None) -> str:
    return issue_ticket(network_hash=network_hash(ip), rounds_left=rounds_left, digest=digest, now=now)


async def _turn(client: AsyncClient, messages: list[dict[str, Any]], ticket: str | None = None, **extra: Any):
    body: dict[str, Any] = {"messages": messages, **extra}
    if ticket is not None:
        body["ticket"] = ticket
    return await client.post(URL, json=body)


async def _first_tool_turn(client: AsyncClient) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Ask the question; Claude calls search_npcs. Returns (conversation incl. reply, response body)."""
    with patch(BUILD_CLIENT, return_value=fake_client(tool_reply("toolu_01"))):
        resp = await _turn(client, [user_text()])
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return [user_text(), data["message"]], data


async def _usage_of(db: AsyncSession, bucket: str) -> int:
    return await get_daily_usage(db, bucket=bucket)


# --- Availability ---------------------------------------------------------------


async def test_unavailable_without_api_key(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    resp = await _turn(client, [user_text()])
    assert resp.status_code == 503
    assert resp.json()["detail"] == "chat_unavailable"


@pytest.mark.parametrize("setting", ["wow_chat_daily_token_cap", "wow_chat_ip_daily_token_cap"])
async def test_unavailable_when_a_cap_is_zero(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, setting: str
) -> None:
    monkeypatch.setattr(settings, setting, 0)
    resp = await _turn(client, [user_text()])
    assert resp.status_code == 503
    assert resp.json()["detail"] == "chat_unavailable"


async def test_serve_only_needs_turnstile_secret(serve_only_client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "serve_only", True)
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await _turn(serve_only_client, [user_text()])
    assert resp.status_code == 503
    assert resp.json()["detail"] == "chat_unavailable"
    fake.messages.create.assert_not_called()


async def test_mounted_in_serve_only_mode(serve_only_client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "serve_only", True)
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    with patch(VERIFY_TURNSTILE, AsyncMock(return_value=(True, []))), patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await serve_only_client.post(URL, json={"messages": [user_text()]}, headers={"X-Turnstile-Token": "t"})
    assert resp.status_code == 200, resp.text


# --- Body cap (before parsing) -----------------------------------------------------


async def test_body_over_cap_is_413_before_anything_else(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")  # would be 503 if the cap ran later
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, content=b"{" + b" " * MAX_BODY_BYTES + b"}", headers={"Content-Type": "application/json"})
    assert resp.status_code == 413
    assert resp.json()["detail"] == "chat_body_too_large"
    fake.messages.create.assert_not_called()


async def test_chunked_body_over_cap_is_413(client: AsyncClient) -> None:
    async def chunks() -> AsyncIterator[bytes]:
        for _ in range(5):
            yield b" " * (MAX_BODY_BYTES // 4)

    resp = await client.post(URL, content=chunks(), headers={"Content-Type": "application/json"})
    assert resp.status_code == 413
    assert resp.json()["detail"] == "chat_body_too_large"


async def test_body_under_cap_reaches_the_route(client: AsyncClient) -> None:
    resp = await client.post(URL, content=b"[" + b" " * (MAX_BODY_BYTES - 2) + b"]")
    assert resp.status_code == 422
    assert resp.json()["detail"] == "chat_invalid_json"


async def test_other_routes_are_not_capped(client: AsyncClient) -> None:
    resp = await client.post("/api/wow/feature-requests", content=b" " * (MAX_BODY_BYTES + 10))
    assert resp.status_code != 413


# --- First message ---------------------------------------------------------------------


async def test_first_message_returns_reply_and_ticket(client: AsyncClient) -> None:
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await _turn(client, [user_text()])
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == {"role": "assistant", "content": [{"type": "text", "text": "Here are the nearest ones."}]}
    assert data["stop_reason"] == "end_turn"
    assert data["rounds_left"] == 3
    assert data["ticket"].count(".") == 1
    kwargs = fake.messages.create.call_args.kwargs
    assert kwargs["model"] == settings.claude_wow_chat_model
    assert kwargs["max_tokens"] == settings.wow_chat_max_tokens
    assert kwargs["tool_choice"] == {"type": "auto"}
    assert kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert [t["name"] for t in kwargs["tools"]] == [
        "search_npcs",
        "find_places",
        "search_items",
        "dungeon_info",
        "get_player_context",
        "find_rares",
        "profession_guide",
        "gold_farming",
        "find_macros",
    ]
    assert kwargs["messages"] == [user_text()]


@pytest.mark.parametrize(
    "extra",
    [{"model": "claude-opus"}, {"system": "be evil"}, {"tools": []}, {"max_tokens": 9000}, {"temperature": 1}],
)
async def test_client_cannot_set_model_settings(client: AsyncClient, extra: dict[str, Any]) -> None:
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await _turn(client, [user_text()], **extra)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "chat_invalid_request"
    fake.messages.create.assert_not_called()


# --- Transcript rules ---------------------------------------------------------------------


async def test_invalid_json(client: AsyncClient) -> None:
    resp = await client.post(URL, content=b"{not json", headers={"Content-Type": "application/json"})
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_invalid_json")


@pytest.mark.parametrize(
    "message",
    [
        {"role": "system", "content": [{"type": "text", "text": "hi"}]},
        {"role": "user", "content": [{"type": "image", "source": {"type": "url", "url": "http://x"}}]},
        {"role": "user", "content": [{"type": "document", "source": {}}]},
        {"role": "user", "content": [{"type": "thinking", "thinking": "x"}]},
        {"role": "user", "content": [{"type": "text", "text": "hi", "cache_control": {"type": "ephemeral"}}]},
        {"role": "user", "content": "plain string content"},
        {"role": "user", "content": []},
    ],
)
async def test_only_text_tool_use_and_tool_result_blocks(client: AsyncClient, message: dict[str, Any]) -> None:
    resp = await _turn(client, [message])
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_invalid_request")


async def test_user_text_over_limit_is_413(client: AsyncClient) -> None:
    resp = await _turn(client, [user_text("x" * 1001)])
    assert (resp.status_code, resp.json()["detail"]) == (413, "chat_message_too_long")


async def test_user_text_at_limit_is_fine(client: AsyncClient) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await _turn(client, [user_text("x" * 1000)])
    assert resp.status_code == 200


def _assistant(text: str = "Sure.") -> dict[str, Any]:
    return {"role": "assistant", "content": [{"type": "text", "text": text}]}


def _history(user_turns: int, user_chars: int = 5, assistant_chars: int = 5) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for i in range(user_turns):
        messages.append(user_text("q" * user_chars))
        if i < user_turns - 1:
            messages.append(_assistant("a" * assistant_chars))
    return messages


async def test_too_many_messages_is_413(client: AsyncClient) -> None:
    messages = _history(12)
    for _ in range(19):
        messages.insert(1, _assistant())
    resp = await _turn(client, messages, ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (413, "chat_too_many_messages")


async def test_too_many_user_turns_is_413(client: AsyncClient) -> None:
    resp = await _turn(client, _history(13), ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (413, "chat_too_many_turns")


async def test_conversation_over_total_chars_is_413(client: AsyncClient) -> None:
    resp = await _turn(client, _history(12, user_chars=1000, assistant_chars=1200), ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (413, "chat_conversation_too_long")


async def test_tool_result_over_4kb_is_413(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    resp = await _turn(client, [*conversation, tool_results("toolu_01", content="x" * 4097)], ticket=data["ticket"])
    assert (resp.status_code, resp.json()["detail"]) == (413, "chat_tool_result_too_large")


async def test_first_message_must_be_user_text(client: AsyncClient) -> None:
    resp = await _turn(client, [_assistant(), user_text()], ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_first_message_not_user_text")
    resp = await _turn(client, [tool_results("toolu_01")], ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_first_message_not_user_text")


async def test_roles_must_alternate_and_end_with_user(client: AsyncClient) -> None:
    resp = await _turn(client, [user_text(), user_text()], ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_bad_role_order")
    resp = await _turn(client, [user_text(), _assistant()], ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_bad_role_order")


async def test_user_message_cannot_mix_text_and_tool_results(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    mixed = {"role": "user", "content": [*tool_results("toolu_01")["content"], {"type": "text", "text": "and?"}]}
    resp = await _turn(client, [*conversation, mixed], ticket=data["ticket"])
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_bad_user_content")


async def test_blank_user_text_is_rejected(client: AsyncClient) -> None:
    resp = await _turn(client, [user_text("   \n ")])
    assert resp.status_code == 422
    assert resp.json()["detail"] in {"chat_first_message_not_user_text", "chat_bad_user_content"}


async def test_assistant_cannot_carry_tool_results(client: AsyncClient) -> None:
    bad = {"role": "assistant", "content": tool_results("toolu_01")["content"]}
    resp = await _turn(client, [user_text(), bad, user_text()], ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_bad_assistant_content")


async def test_tool_call_must_be_answered_with_results(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    resp = await _turn(client, [*conversation, user_text("never mind")], ticket=data["ticket"])
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_tool_result_required")


@pytest.mark.parametrize("ids", [("toolu_99",), ("toolu_01", "toolu_01"), ("toolu_01", "toolu_02")])
async def test_tool_result_ids_must_match_the_calls(client: AsyncClient, ids: tuple[str, ...]) -> None:
    conversation, data = await _first_tool_turn(client)
    resp = await _turn(client, [*conversation, tool_results(*ids)], ticket=data["ticket"])
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_tool_result_mismatch")


@pytest.mark.parametrize(
    "block",
    [
        {"type": "tool_use", "id": "toolu_01", "name": "web_search", "input": {}},
        {"type": "tool_use", "id": "bad id!", "name": "search_npcs", "input": {}},
        {"type": "tool_use", "id": "toolu_01", "name": "search_npcs", "input": "not an object"},
    ],
)
async def test_history_tool_calls_are_strict(client: AsyncClient, block: dict[str, Any]) -> None:
    messages = [user_text(), {"role": "assistant", "content": [block]}, tool_results("toolu_01")]
    resp = await _turn(client, messages, ticket=_ticket())
    assert (resp.status_code, resp.json()["detail"]) == (422, "chat_invalid_request")


# --- Tickets ----------------------------------------------------------------------------


async def test_continuation_without_ticket(client: AsyncClient) -> None:
    conversation, _ = await _first_tool_turn(client)
    resp = await _turn(client, [*conversation, tool_results("toolu_01")])
    assert (resp.status_code, resp.json()["detail"]) == (400, "chat_ticket_required")


async def test_new_message_with_history_needs_a_ticket(client: AsyncClient) -> None:
    resp = await _turn(client, [user_text(), _assistant(), user_text("and?")])
    assert (resp.status_code, resp.json()["detail"]) == (400, "chat_ticket_required")


@pytest.mark.parametrize("ticket", ["garbage", "a.b", ".", "x" * 200])
async def test_malformed_ticket(client: AsyncClient, ticket: str) -> None:
    conversation, _ = await _first_tool_turn(client)
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=ticket)
    assert (resp.status_code, resp.json()["detail"]) == (400, "chat_ticket_invalid")


async def test_forged_ticket_payload(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    payload, signature = data["ticket"].split(".")
    forged_payload = issue_ticket(network_hash=network_hash(LOCAL_IP), rounds_left=99, digest="f" * 64).split(".")[0]
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=f"{forged_payload}.{signature}")
    assert (resp.status_code, resp.json()["detail"]) == (400, "chat_ticket_invalid")


async def test_ticket_signed_with_another_secret(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    conversation, data = await _first_tool_turn(client)
    monkeypatch.setattr(settings, "secret_key", "fixture-rotated-secret-key-for-ticket-test")
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=data["ticket"])
    assert resp.status_code == 400


async def test_expired_ticket(client: AsyncClient) -> None:
    conversation, _ = await _first_tool_turn(client)
    old = _ticket(now=time.time() - TICKET_TTL_SECONDS - 1)
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=old)
    assert (resp.status_code, resp.json()["detail"]) == (409, "chat_ticket_expired")


async def test_ticket_from_another_network(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    resp = await client.post(
        URL,
        json={"messages": [*conversation, tool_results("toolu_01")], "ticket": data["ticket"]},
        headers={"X-Forwarded-For": "203.0.113.9"},
    )
    assert (resp.status_code, resp.json()["detail"]) == (409, "chat_ticket_expired")


async def test_ticket_follows_the_ipv6_64_network(client: AsyncClient) -> None:
    ticket = _ticket(ip="2001:db8:1:2::1")
    other_host_same_64 = "2001:db8:1:2:ffff::9"
    with patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await client.post(
            URL,
            json={"messages": [user_text(), _assistant(), user_text("and?")], "ticket": ticket},
            headers={"X-Forwarded-For": other_host_same_64},
        )
    # Same /64 -> the network check passes; the (dummy) digest is what fails.
    assert (resp.status_code, resp.json()["detail"]) == (400, "chat_ticket_invalid")


async def test_altered_history_fails_the_digest(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    conversation[1]["content"][1]["input"] = {"query": "anything else"}
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=data["ticket"])
    assert (resp.status_code, resp.json()["detail"]) == (400, "chat_ticket_invalid")


async def test_rounds_exhausted(client: AsyncClient) -> None:
    conversation, _ = await _first_tool_turn(client)
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=_ticket(rounds_left=0))
    assert (resp.status_code, resp.json()["detail"]) == (409, "chat_tool_rounds_exhausted")


async def test_full_tool_loop_ends_with_a_text_only_round(client: AsyncClient) -> None:
    conversation, data = await _first_tool_turn(client)
    choices: list[dict[str, str]] = []
    for expected_rounds_left, tool_id in ((2, "toolu_02"), (1, "toolu_03")):
        last_id = conversation[-1]["content"][-1]["id"]
        fake = fake_client(tool_reply(tool_id))
        with patch(BUILD_CLIENT, return_value=fake):
            resp = await _turn(client, [*conversation, tool_results(last_id)], ticket=data["ticket"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["rounds_left"] == expected_rounds_left
        assert data["stop_reason"] == "tool_use"
        choices.append(fake.messages.create.call_args.kwargs["tool_choice"])
        conversation = [*conversation, tool_results(last_id), data["message"]]

    # Last allowed round: tools are off, so even a tool call from Claude is not relayed.
    fake = fake_client(reply(text_block("Two trainers nearby."), tool_block("toolu_04"), stop_reason="tool_use"))
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await _turn(client, [*conversation, tool_results("toolu_03")], ticket=data["ticket"])
    assert resp.status_code == 200
    data = resp.json()
    assert fake.messages.create.call_args.kwargs["tool_choice"] == {"type": "none"}
    assert choices == [{"type": "auto"}, {"type": "auto"}]
    assert data["rounds_left"] == 0
    assert data["stop_reason"] == "end_turn"
    assert data["message"]["content"] == [{"type": "text", "text": "Two trainers nearby."}]

    # The chat goes on: a new question with the whole history and the latest ticket.
    conversation = [*conversation, tool_results("toolu_03"), data["message"], user_text("and the closest flight master?")]
    with patch(BUILD_CLIENT, return_value=fake_client()) as build:
        resp = await _turn(client, conversation, ticket=data["ticket"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["rounds_left"] == 3
    assert build.return_value.messages.create.call_args.kwargs["messages"][0] == user_text()


async def test_continuation_skips_turnstile(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    conversation, data = await _first_tool_turn(client)
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    verify = AsyncMock(return_value=(True, []))
    with patch(VERIFY_TURNSTILE, verify), patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket=data["ticket"])
    assert resp.status_code == 200
    verify.assert_not_called()


# --- Turnstile + per-IP limits ----------------------------------------------------------


async def test_new_message_needs_turnstile_with_chat_action(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    resp = await _turn(client, [user_text()])
    assert resp.status_code == 400
    verify = AsyncMock(return_value=(True, []))
    with patch(VERIFY_TURNSTILE, verify), patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await client.post(URL, json={"messages": [user_text()]}, headers={"X-Turnstile-Token": "tok"})
    assert resp.status_code == 200
    assert verify.call_args.kwargs["expected_action"] == "wow-chat"


async def test_turnstile_runs_before_validation(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    resp = await _turn(client, [user_text("x" * 5000)])
    assert resp.status_code == 400


async def test_turn_hourly_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_chat.turn_hourly_limiter, "_config", _BucketConfig(2, 3600))
    with patch(BUILD_CLIENT, return_value=fake_client()):
        statuses = [(await _turn(client, [user_text()])).status_code for _ in range(3)]
        other_ip = await client.post(URL, json={"messages": [user_text()]}, headers={"X-Forwarded-For": "198.51.100.7"})
    assert statuses == [200, 200, 429]
    assert other_ip.status_code == 200


async def test_turn_limit_sends_retry_after(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_chat.turn_daily_limiter, "_config", _BucketConfig(1, 86400))
    with patch(BUILD_CLIENT, return_value=fake_client()):
        await _turn(client, [user_text()])
        resp = await _turn(client, [user_text()])
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) > 0


async def test_continuation_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    conversation, data = await _first_tool_turn(client)
    monkeypatch.setattr(wow_chat.continuation_limiter, "_config", _BucketConfig(1, 3600))
    body = [*conversation, tool_results("toolu_01")]
    with patch(BUILD_CLIENT, return_value=fake_client()):
        first = await _turn(client, body, ticket=data["ticket"])
        second = await _turn(client, body, ticket=data["ticket"])
    assert (first.status_code, second.status_code) == (200, 429)
    assert int(second.headers["retry-after"]) > 0


async def test_ticket_is_checked_before_the_continuation_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    conversation, _ = await _first_tool_turn(client)
    monkeypatch.setattr(wow_chat.continuation_limiter, "_config", _BucketConfig(0, 3600))
    resp = await _turn(client, [*conversation, tool_results("toolu_01")], ticket="garbage")
    assert resp.status_code == 400


# --- Token budgets ----------------------------------------------------------------------


async def test_settles_to_weighted_usage(client: AsyncClient, db: AsyncSession) -> None:
    answer = reply(text_block("Here."), reply_usage=usage(input_tokens=1000, output_tokens=100, cache_read=2000))
    with patch(BUILD_CLIENT, return_value=fake_client(answer)):
        resp = await _turn(client, [user_text()])
    assert resp.status_code == 200
    expected = 1000 + 2000 // 10 + 5 * 100
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == expected
    assert await _usage_of(db, ip_bucket(network_hash(LOCAL_IP))) == expected


async def test_anthropic_error_releases_the_whole_reservation(client: AsyncClient, db: AsyncSession) -> None:
    error = status_error(anthropic.InternalServerError, 500, "api_error")
    with patch(BUILD_CLIENT, return_value=fake_client(error=error)):
        resp = await _turn(client, [user_text()])
    assert (resp.status_code, resp.json()["detail"]) == (503, "chat_failed")
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == 0
    assert await _usage_of(db, ip_bucket(network_hash(LOCAL_IP))) == 0


async def test_anthropic_rate_limit_is_429_busy(client: AsyncClient, db: AsyncSession) -> None:
    error = status_error(anthropic.RateLimitError, 429, "rate_limit_error")
    with patch(BUILD_CLIENT, return_value=fake_client(error=error)):
        resp = await _turn(client, [user_text()])
    assert (resp.status_code, resp.json()["detail"]) == (429, "chat_upstream_busy")
    assert resp.headers["retry-after"] == "60"
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == 0


async def test_connection_error_releases(client: AsyncClient, db: AsyncSession) -> None:
    error = anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    with patch(BUILD_CLIENT, return_value=fake_client(error=error)):
        resp = await _turn(client, [user_text()])
    assert (resp.status_code, resp.json()["detail"]) == (503, "chat_failed")
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == 0


async def test_global_cap_reached(client: AsyncClient, db: AsyncSession) -> None:
    cap = settings.wow_chat_daily_token_cap
    assert await try_consume_daily_quota_amount(db, bucket=GLOBAL_TOKEN_BUCKET, cap=cap, amount=cap - 10)
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await _turn(client, [user_text()])
    assert (resp.status_code, resp.json()["detail"]) == (429, "chat_daily_limit_reached")
    assert int(resp.headers["retry-after"]) > 0
    fake.messages.create.assert_not_called()


async def test_network_cap_reached_charges_nothing(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "wow_chat_ip_daily_token_cap", estimate_tokens(0) - 1)

    @asynccontextmanager
    async def rolling_back_unit_of_work() -> AsyncIterator[AsyncSession]:
        # Like the real unit_of_work: an exception inside undoes everything in it.
        async with db.begin_nested():
            yield db

    monkeypatch.setattr(chat_quota, "unit_of_work", rolling_back_unit_of_work)
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await _turn(client, [user_text()])
    assert (resp.status_code, resp.json()["detail"]) == (429, "chat_ip_daily_limit_reached")
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == 0
    fake.messages.create.assert_not_called()


async def test_rejected_input_burns_no_quota(client: AsyncClient, db: AsyncSession) -> None:
    resp = await _turn(client, [user_text("x" * 1001)])
    assert resp.status_code == 413
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == 0


# --- Claude's reply is filtered --------------------------------------------------------------


async def test_unknown_tools_and_other_blocks_are_dropped(client: AsyncClient) -> None:
    answer = reply(
        Namespace(type="thinking", thinking="secret plan"),
        Namespace(type="server_tool_use", id="srvtoolu_1", name="web_search", input={"query": "x"}),
        tool_block("toolu_09", name="web_search"),
        text_block("Here you go."),
        text_block("   "),
        stop_reason="tool_use",
    )
    with patch(BUILD_CLIENT, return_value=fake_client(answer)):
        resp = await _turn(client, [user_text()])
    data = resp.json()
    assert data["message"]["content"] == [{"type": "text", "text": "Here you go."}]
    assert data["stop_reason"] == "end_turn"


async def test_tool_calls_only_pass_when_claude_stopped_for_them(client: AsyncClient) -> None:
    answer = reply(text_block("Done."), tool_block("toolu_05"), stop_reason="end_turn")
    with patch(BUILD_CLIENT, return_value=fake_client(answer)):
        resp = await _turn(client, [user_text()])
    assert resp.json()["message"]["content"] == [{"type": "text", "text": "Done."}]


async def test_oversized_tool_input_is_dropped(client: AsyncClient) -> None:
    answer = reply(text_block("Hm."), tool_block("toolu_06", tool_input={"query": "x" * 2000}), stop_reason="tool_use")
    with patch(BUILD_CLIENT, return_value=fake_client(answer)):
        resp = await _turn(client, [user_text()])
    assert resp.json()["stop_reason"] == "end_turn"
    assert len(resp.json()["message"]["content"]) == 1


async def test_max_tokens_stop_reason_is_passed_on(client: AsyncClient) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client(reply(text_block("Partial"), stop_reason="max_tokens"))):
        resp = await _turn(client, [user_text()])
    assert resp.json()["stop_reason"] == "max_tokens"


async def test_empty_reply_fails_but_charges_actual_usage(client: AsyncClient, db: AsyncSession) -> None:
    answer = reply(tool_block("toolu_07", name="web_search"), stop_reason="tool_use", reply_usage=usage(500, 10))
    with patch(BUILD_CLIENT, return_value=fake_client(answer)):
        resp = await _turn(client, [user_text()])
    assert (resp.status_code, resp.json()["detail"]) == (503, "chat_failed")
    assert await _usage_of(db, GLOBAL_TOKEN_BUCKET) == 500 + 5 * 10


# --- Logging ------------------------------------------------------------------------------


async def test_logs_never_carry_content(client: AsyncClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    conversation, data = await _first_tool_turn(client)
    secret_result = '{"results":[{"name":"fixture-trainer-name"}]}'
    with patch(BUILD_CLIENT, return_value=fake_client(reply(text_block("fixture model prose")))):
        resp = await _turn(client, [*conversation, tool_results("toolu_01", content=secret_result)], ticket=data["ticket"])
    assert resp.status_code == 200
    await _turn(client, [user_text("fixture rejected text " + "x" * 1000)])
    text = caplog.text
    for fragment in (QUESTION, "warlock trainer", "fixture-trainer-name", "fixture model prose", "fixture rejected"):
        assert fragment not in text
    assert "wow chat: turn kind=continuation round=1" in text


class Namespace:
    def __init__(self, **values: Any) -> None:
        self.__dict__.update(values)


def test_tool_names_round_trip_through_json() -> None:
    assert json.loads(json.dumps(tool_results("toolu_01")))["content"][0]["tool_use_id"] == "toolu_01"
