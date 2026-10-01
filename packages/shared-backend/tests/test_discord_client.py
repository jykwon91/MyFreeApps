"""Unit tests for platform_shared.services.discord.client.

Uses ``httpx.MockTransport`` injected via the ``transport`` constructor parameter
so tests stay fully offline and do not need monkeypatching of module globals.

Test coverage:
  - 429 rate-limit: retries then succeeds on the next attempt
  - 429 exhausted: DiscordApiError raised after MAX_RETRIES
  - Error-code parsing into DiscordApiError (status + code + message)
  - allowed_mentions default injected when not supplied by caller
  - allowed_mentions preserved when caller supplies it explicitly
  - send_dm two-step: create_dm_channel then create_message
  - Bot token not present in log output on error or normal paths
  - repr() does not expose the bot token
  - bulk_overwrite_global_commands passes command list
  - bulk_overwrite_guild_commands passes command list
"""
import json
import logging
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from platform_shared.services.discord.client import (
    CANNOT_SEND_MESSAGES_TO_USER,
    MISSING_PERMISSIONS,
    UNKNOWN_MESSAGE,
    DiscordApiError,
    DiscordRestClient,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SECRET_TOKEN = "Bot-Secret-12345-ABCDE"


def _make_client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    sleep_log: list[float] | None = None,
) -> DiscordRestClient:
    """Build a ``DiscordRestClient`` wired to a ``MockTransport`` for offline tests."""
    slept: list[float] = sleep_log if sleep_log is not None else []

    async def _fake_sleep(n: float) -> None:
        slept.append(n)

    return DiscordRestClient(
        _SECRET_TOKEN,
        transport=httpx.MockTransport(handler),
        sleep=_fake_sleep,
    )


def _json_response(data: Any, *, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=data)


# ---------------------------------------------------------------------------
# 429 rate-limit handling
# ---------------------------------------------------------------------------

class TestRateLimit:
    @pytest.mark.anyio
    async def test_retries_on_429_then_succeeds(self) -> None:
        """First 429 triggers a sleep; second call returns 200."""
        call_count = 0
        slept: list[float] = []

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _json_response({"retry_after": 0.5, "global": False}, status=429)
            return _json_response({"id": "msg-ok", "content": "hello"})

        async with _make_client(handler, sleep_log=slept) as client:
            result = await client.create_message("ch1", {"content": "hello"})

        assert result["id"] == "msg-ok"
        assert call_count == 2
        assert len(slept) == 1
        assert slept[0] == pytest.approx(0.5, abs=0.01)

    @pytest.mark.anyio
    async def test_retry_after_capped_at_max_sleep(self) -> None:
        """retry_after values above MAX_SLEEP_CAP_S must be clamped."""
        slept: list[float] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if len(slept) == 0 and not slept:
                return _json_response({"retry_after": 9999.0, "global": False}, status=429)
            return _json_response({"id": "msg-ok"})

        # We need to track calls separately because slept is checked in the handler
        call_count = {"n": 0}

        def handler2(request: httpx.Request) -> httpx.Response:
            call_count["n"] += 1
            if call_count["n"] == 1:
                return _json_response({"retry_after": 9999.0, "global": False}, status=429)
            return _json_response({"id": "msg-ok"})

        async with _make_client(handler2, sleep_log=slept) as client:
            await client.create_message("ch1", {"content": "hi"})

        assert slept[0] <= DiscordRestClient.MAX_SLEEP_CAP_S

    @pytest.mark.anyio
    async def test_exhausted_retries_raises_discord_api_error(self) -> None:
        """MAX_RETRIES consecutive 429 responses must raise DiscordApiError."""
        def handler(_: httpx.Request) -> httpx.Response:
            return _json_response({"retry_after": 0.001, "global": False}, status=429)

        async with _make_client(handler) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await client.create_message("ch1", {"content": "spam"})

        assert exc_info.value.status == 429

    @pytest.mark.anyio
    async def test_global_rate_limit_logged(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A global 429 must log ``global=True``."""
        call_count = {"n": 0}

        def handler(_: httpx.Request) -> httpx.Response:
            call_count["n"] += 1
            if call_count["n"] == 1:
                return _json_response({"retry_after": 0.001, "global": True}, status=429)
            return _json_response({"id": "msg"})

        with caplog.at_level(logging.WARNING, logger="platform_shared.services.discord.client"):
            async with _make_client(handler) as client:
                await client.create_message("ch1", {"content": "hi"})

        assert any("global=True" in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------------------
# Error-code parsing
# ---------------------------------------------------------------------------

class TestErrorCodeParsing:
    @pytest.mark.anyio
    async def test_403_raises_with_discord_code(self) -> None:
        """A 403 with a Discord error code must surface in DiscordApiError."""
        def handler(_: httpx.Request) -> httpx.Response:
            return _json_response(
                {"code": MISSING_PERMISSIONS, "message": "Missing Permissions"},
                status=403,
            )

        async with _make_client(handler) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await client.create_message("ch1", {"content": "forbidden"})

        err = exc_info.value
        assert err.status == 403
        assert err.code == MISSING_PERMISSIONS
        assert "Missing Permissions" in err.message

    @pytest.mark.anyio
    async def test_404_unknown_message_code(self) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return _json_response(
                {"code": UNKNOWN_MESSAGE, "message": "Unknown Message"},
                status=404,
            )

        async with _make_client(handler) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await client.edit_message("ch1", "msg1", {"content": "edit"})

        assert exc_info.value.code == UNKNOWN_MESSAGE

    @pytest.mark.anyio
    async def test_cannot_send_to_user_code(self) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return _json_response(
                {"code": CANNOT_SEND_MESSAGES_TO_USER, "message": "Cannot send messages to this user"},
                status=403,
            )

        async with _make_client(handler) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await client.create_dm_channel("user999")

        assert exc_info.value.code == CANNOT_SEND_MESSAGES_TO_USER

    @pytest.mark.anyio
    async def test_non_json_error_body_still_raises(self) -> None:
        """A non-JSON 500 body must still raise DiscordApiError (code=None)."""
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="Internal Server Error")

        async with _make_client(handler) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await client.create_message("ch1", {"content": "hi"})

        assert exc_info.value.status == 500
        assert exc_info.value.code is None

    @pytest.mark.anyio
    async def test_error_logged_with_status_and_code(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Error log must include the HTTP status and Discord code, never the token."""
        def handler(_: httpx.Request) -> httpx.Response:
            return _json_response({"code": 50001, "message": "Missing Access"}, status=403)

        with caplog.at_level(logging.WARNING, logger="platform_shared.services.discord.client"):
            async with _make_client(handler) as client:
                with pytest.raises(DiscordApiError):
                    await client.create_message("ch1", {"content": "x"})

        assert any("403" in r.getMessage() for r in caplog.records)
        assert any("50001" in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------------------
# allowed_mentions safety
# ---------------------------------------------------------------------------

class TestAllowedMentions:
    @pytest.mark.anyio
    async def test_default_safe_mentions_injected(self) -> None:
        """When the caller omits allowed_mentions, parse=[] must be injected."""
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content)
            return _json_response({"id": "msg1"})

        async with _make_client(handler) as client:
            await client.create_message("ch1", {"content": "hello @everyone"})

        assert captured["body"]["allowed_mentions"] == {"parse": []}

    @pytest.mark.anyio
    async def test_caller_supplied_mentions_preserved(self) -> None:
        """An explicit allowed_mentions from the caller must be passed through unchanged."""
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content)
            return _json_response({"id": "msg2"})

        custom_mentions = {"parse": [], "users": ["123456789"]}

        async with _make_client(handler) as client:
            await client.create_message(
                "ch1",
                {"content": "hey <@123456789>", "allowed_mentions": custom_mentions},
            )

        assert captured["body"]["allowed_mentions"] == custom_mentions

    @pytest.mark.anyio
    async def test_safe_mentions_on_edit_message(self) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content)
            return _json_response({"id": "msg1"})

        async with _make_client(handler) as client:
            await client.edit_message("ch1", "msg1", {"content": "edited"})

        assert captured["body"]["allowed_mentions"] == {"parse": []}

    @pytest.mark.anyio
    async def test_safe_mentions_on_followup(self) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content)
            return _json_response({"id": "fup1"})

        async with _make_client(handler) as client:
            await client.create_followup_message("app1", "tok1", {"content": "follow"})

        assert captured["body"]["allowed_mentions"] == {"parse": []}


# ---------------------------------------------------------------------------
# send_dm two-step
# ---------------------------------------------------------------------------

class TestSendDm:
    @pytest.mark.anyio
    async def test_send_dm_creates_channel_then_posts_message(self) -> None:
        """send_dm must first POST /users/@me/channels, then POST /channels/{id}/messages.

        httpx merges base_url ("https://discord.com/api/v10") with each path, so
        request.url.path includes the full "/api/v10" prefix.  We assert on the
        meaningful suffix using endswith() to stay independent of the base_url shape.
        """
        requests_seen: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path
            requests_seen.append(path)
            if path.endswith("/users/@me/channels"):
                return _json_response({"id": "dm-channel-42", "type": 1})
            if path.endswith("/channels/dm-channel-42/messages"):
                return _json_response({"id": "dm-msg-7", "content": "hi"})
            return httpx.Response(404, json={"error": f"unexpected path {path}"})

        async with _make_client(handler) as client:
            result = await client.send_dm("user-99", {"content": "hi"})

        assert result["id"] == "dm-msg-7"
        assert len(requests_seen) == 2
        assert requests_seen[0].endswith("/users/@me/channels")
        assert requests_seen[1].endswith("/channels/dm-channel-42/messages")

    @pytest.mark.anyio
    async def test_send_dm_propagates_channel_error(self) -> None:
        """An error from create_dm_channel must propagate before the message send."""
        call_count = {"n": 0}

        def handler(_: httpx.Request) -> httpx.Response:
            call_count["n"] += 1
            return _json_response(
                {"code": CANNOT_SEND_MESSAGES_TO_USER, "message": "Cannot send"},
                status=403,
            )

        async with _make_client(handler) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await client.send_dm("blocked-user", {"content": "hi"})

        assert exc_info.value.code == CANNOT_SEND_MESSAGES_TO_USER
        # Must stop after channel creation fails — does not attempt message send
        assert call_count["n"] == 1


# ---------------------------------------------------------------------------
# Token safety
# ---------------------------------------------------------------------------

class TestTokenSafety:
    def test_repr_does_not_expose_token(self) -> None:
        """repr() must not include the actual bot token."""
        client = DiscordRestClient(_SECRET_TOKEN)
        representation = repr(client)
        assert _SECRET_TOKEN not in representation
        assert "redacted" in representation

    @pytest.mark.anyio
    async def test_token_absent_from_logs_on_error(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """No log record should contain the raw bot token string."""
        def handler(_: httpx.Request) -> httpx.Response:
            return _json_response({"code": 50001, "message": "Missing Access"}, status=403)

        with caplog.at_level(logging.DEBUG, logger="platform_shared.services.discord.client"):
            async with _make_client(handler) as client:
                with pytest.raises(DiscordApiError):
                    await client.create_message("ch1", {"content": "x"})

        for record in caplog.records:
            assert _SECRET_TOKEN not in record.getMessage(), (
                f"Token leaked in log record: {record.getMessage()!r}"
            )

    @pytest.mark.anyio
    async def test_token_absent_from_logs_on_rate_limit(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Rate-limit log records must not include the bot token."""
        call_count = {"n": 0}

        def handler(_: httpx.Request) -> httpx.Response:
            call_count["n"] += 1
            if call_count["n"] == 1:
                return _json_response({"retry_after": 0.001, "global": False}, status=429)
            return _json_response({"id": "msg"})

        with caplog.at_level(logging.DEBUG, logger="platform_shared.services.discord.client"):
            async with _make_client(handler) as client:
                await client.create_message("ch1", {"content": "hi"})

        for record in caplog.records:
            assert _SECRET_TOKEN not in record.getMessage()


# ---------------------------------------------------------------------------
# Bulk command overwrite
# ---------------------------------------------------------------------------

class TestBulkOverwriteCommands:
    @pytest.mark.anyio
    async def test_bulk_overwrite_global_commands(self) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["body"] = json.loads(request.content)
            return _json_response([{"id": "cmd-1", "name": "ping"}])

        commands = [{"name": "ping", "description": "Pong", "type": 1}]

        async with _make_client(handler) as client:
            result = await client.bulk_overwrite_global_commands("app-123", commands)

        # httpx merges base_url path, so check the meaningful suffix
        assert captured["path"].endswith("/applications/app-123/commands")
        assert captured["body"] == commands
        assert result[0]["name"] == "ping"

    @pytest.mark.anyio
    async def test_bulk_overwrite_guild_commands(self) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["body"] = json.loads(request.content)
            return _json_response([{"id": "guild-cmd-1", "name": "raid"}])

        commands = [{"name": "raid", "description": "Manage raids", "type": 1}]

        async with _make_client(handler) as client:
            result = await client.bulk_overwrite_guild_commands(
                "app-123", "guild-456", commands
            )

        assert captured["path"].endswith("/applications/app-123/guilds/guild-456/commands")
        assert result[0]["name"] == "raid"


# ---------------------------------------------------------------------------
# Context manager guard
# ---------------------------------------------------------------------------

class TestContextManagerGuard:
    @pytest.mark.anyio
    async def test_raises_if_not_entered(self) -> None:
        """Calling a method before entering the context manager must raise RuntimeError."""
        client = DiscordRestClient("token-x", transport=httpx.MockTransport(lambda _: httpx.Response(200)))
        with pytest.raises(RuntimeError, match="context manager"):
            await client.create_message("ch1", {"content": "hi"})
