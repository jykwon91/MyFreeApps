"""Discord REST API client (async, httpx).

Wraps the Discord API v10 with:
  - ``Authorization: Bot <token>`` on every request
  - Branded User-Agent per Discord API docs
  - 429 rate-limit handling: honour ``retry_after`` / ``Retry-After`` with bounded retries
  - Structured error logging (status + discord error code + route; token never logged)
  - Safe ``allowed_mentions`` defaults so user-controlled text cannot ping @everyone/@here

Usage::

    async with DiscordRestClient(settings.discord_bot_token) as client:
        await client.create_message(channel_id, {"content": "Hello!"})

``transport`` is injectable for unit tests — pass ``httpx.MockTransport(handler)``
and the client uses it instead of the real network.
"""
import asyncio
import logging
from types import TracebackType
from typing import Any, Final

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Well-known Discord error codes
# https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-error-codes
# ---------------------------------------------------------------------------

CANNOT_SEND_MESSAGES_TO_USER: Final = 50007
UNKNOWN_MESSAGE: Final = 10008
UNKNOWN_CHANNEL: Final = 10003
MISSING_ACCESS: Final = 50001
MISSING_PERMISSIONS: Final = 50013
UNKNOWN_INTERACTION: Final = 10062
# A reply (message_reference) needs Read Message History in the channel.
CANNOT_REPLY_WITHOUT_READ_HISTORY: Final = 160002

# ---------------------------------------------------------------------------
# Safe allowed_mentions default
# {"parse": []} disables all mention parsing; user-controlled text never pings
# @everyone, @here, roles, or users unless the caller explicitly adds them.
# ---------------------------------------------------------------------------

_SAFE_ALLOWED_MENTIONS: Final[dict[str, Any]] = {"parse": []}


class DiscordApiError(Exception):
    """Raised when the Discord REST API returns a 4xx/5xx response.

    Per rules/check-third-party-error-codes.md, structured error fields are
    captured and logged so callers can route on specific ``code`` values.

    Attributes:
        status:  HTTP status code (e.g. 403, 404).
        code:    Discord application-level error code (int), or ``None`` if the
                 response body is unparseable.
        message: Human-readable error description from Discord.
    """

    def __init__(self, status: int, code: int | None, message: str) -> None:
        super().__init__(f"Discord API error {status}: code={code} message={message!r}")
        self.status = status
        self.code = code
        self.message = message


class DiscordRestClient:
    """Async Discord REST API client.

    Manages a single ``httpx.AsyncClient`` for the lifetime of the context.
    Must be used as an ``async with`` context manager.

    Args:
        bot_token: Discord bot token (``Bot <token>``-prefixed in ``Authorization``).
                   Never logged or included in ``repr()``.
        sleep:     Async callable used for rate-limit back-off.  Inject
                   ``lambda _: None`` or a list-recording coroutine in tests.
        transport: Optional ``httpx.AsyncBaseTransport`` injected for tests
                   (e.g. ``httpx.MockTransport(handler)``).  When ``None``
                   (the default) the real network is used.
    """

    BASE_URL: Final = "https://discord.com/api/v10"
    USER_AGENT: Final = "DiscordBot (https://myfreeapps.org, 1.0)"

    MAX_RETRIES: Final = 3
    MAX_SLEEP_CAP_S: Final = 10.0  # never sleep longer than this per attempt

    def __init__(
        self,
        bot_token: str,
        *,
        sleep: Any = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._bot_token = bot_token
        self._sleep: Any = sleep if sleep is not None else asyncio.sleep
        self._transport = transport
        self._client: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        """Never include the token in repr output."""
        return f"{self.__class__.__name__}(bot_token=<redacted>)"

    async def __aenter__(self) -> "DiscordRestClient":
        kwargs: dict[str, Any] = {
            "base_url": self.BASE_URL,
            "headers": {
                "Authorization": f"Bot {self._bot_token}",
                "User-Agent": self.USER_AGENT,
            },
        }
        if self._transport is not None:
            kwargs["transport"] = self._transport
        self._client = httpx.AsyncClient(**kwargs)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Internal request helpers
    # ------------------------------------------------------------------

    def _assert_open(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError(
                "DiscordRestClient must be used as an async context manager"
            )
        return self._client

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Execute ``method path`` with automatic rate-limit retries.

        Respects the ``retry_after`` field in the 429 JSON body (seconds float)
        and the ``Retry-After`` header as a fallback.  Sleeps are bounded to
        ``MAX_SLEEP_CAP_S`` per attempt.  After ``MAX_RETRIES`` exhausted,
        returns the last (still-429) response so ``_raise_for_status`` can
        convert it to ``DiscordApiError``.
        """
        client = self._assert_open()
        resp: httpx.Response | None = None
        for attempt in range(self.MAX_RETRIES):
            resp = await client.request(method, path, **kwargs)
            if resp.status_code != 429:
                return resp
            try:
                data: dict[str, Any] = resp.json()
            except Exception:
                data = {}
            raw_retry = data.get("retry_after") or resp.headers.get("Retry-After") or 1.0
            retry_after = min(float(raw_retry), self.MAX_SLEEP_CAP_S)
            is_global = bool(data.get("global", False))
            logger.warning(
                "Discord rate limited: route=%s attempt=%d retry_after=%.2fs global=%s",
                path,
                attempt + 1,
                retry_after,
                is_global,
            )
            if attempt + 1 < self.MAX_RETRIES:
                await self._sleep(retry_after)
        assert resp is not None
        return resp  # 429 after all retries; caller will raise DiscordApiError

    def _raise_for_status(self, resp: httpx.Response, route: str) -> None:
        """Raise :exc:`DiscordApiError` for 4xx/5xx responses.

        Logs WARNING with status + Discord error code + route.  The bot token
        is never logged (it lives only in the Authorization header; we only
        log the route path, not headers).
        """
        if resp.status_code < 400:
            return
        code: int | None = None
        message = ""
        try:
            data = resp.json()
            code = data.get("code")
            message = data.get("message", "")
        except Exception:
            pass
        logger.warning(
            "Discord API error: status=%d discord_code=%s route=%s",
            resp.status_code,
            code,
            route,
        )
        raise DiscordApiError(resp.status_code, code, message)

    async def _call(
        self,
        method: str,
        path: str,
        json: Any = None,
        params: dict[str, str] | None = None,
    ) -> Any:
        """Make a request and return the parsed response body (or ``None`` for 204).

        ``params`` become the query string. Only ``path`` is ever logged (see
        :meth:`_raise_for_status`), so query values never reach the logs either.
        """
        kwargs: dict[str, Any] = {}
        if json is not None:
            kwargs["json"] = json
        if params is not None:
            kwargs["params"] = params
        resp = await self._request(method, path, **kwargs)
        self._raise_for_status(resp, path)
        if resp.status_code == 204:
            return None
        return resp.json()

    # ------------------------------------------------------------------
    # allowed_mentions helper
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_payload(payload: dict[str, Any]) -> dict[str, Any]:
        """Inject safe ``allowed_mentions`` if the caller did not supply one.

        ``{"parse": []}`` disables all implicit mention resolution so that
        user-provided text in ``content`` can never accidentally ping @everyone,
        @here, or any role/user.  Callers who need explicit pings should include
        ``allowed_mentions`` with the specific ``users`` or ``roles`` arrays.
        """
        if "allowed_mentions" not in payload:
            return {**payload, "allowed_mentions": _SAFE_ALLOWED_MENTIONS}
        return payload

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_message(
        self, channel_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /channels/{channel_id}/messages.

        Creates a message in the given channel.  ``allowed_mentions`` defaults
        to ``{"parse": []}`` if the caller does not supply it.
        """
        result = await self._call(
            "POST",
            f"/channels/{channel_id}/messages",
            json=self._safe_payload(payload),
        )
        assert result is not None, "create_message must return a message object"
        return result

    async def edit_message(
        self, channel_id: str, message_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """PATCH /channels/{channel_id}/messages/{message_id}.

        Edits an existing message.
        """
        result = await self._call(
            "PATCH",
            f"/channels/{channel_id}/messages/{message_id}",
            json=self._safe_payload(payload),
        )
        assert result is not None, "edit_message must return a message object"
        return result

    async def delete_message(self, channel_id: str, message_id: str) -> None:
        """DELETE /channels/{channel_id}/messages/{message_id}.

        The bot may always delete its own messages; anyone else's needs
        Manage Messages.  A message that's already gone raises
        ``UNKNOWN_MESSAGE`` (10008).
        """
        await self._call("DELETE", f"/channels/{channel_id}/messages/{message_id}")

    async def create_dm_channel(self, user_id: str) -> dict[str, Any]:
        """POST /users/@me/channels — open or retrieve an existing DM channel.

        Returns the DM channel object (with ``id`` field).
        """
        result = await self._call(
            "POST",
            "/users/@me/channels",
            json={"recipient_id": user_id},
        )
        assert result is not None, "create_dm_channel must return a channel object"
        return result

    async def send_dm(
        self, user_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Send a direct message to ``user_id``.

        Two-step: opens (or retrieves) the DM channel via
        :meth:`create_dm_channel`, then calls :meth:`create_message`.
        """
        channel = await self.create_dm_channel(user_id)
        channel_id: str = channel["id"]
        return await self.create_message(channel_id, payload)

    async def edit_original_interaction_response(
        self,
        application_id: str,
        interaction_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """PATCH /webhooks/{application_id}/{interaction_token}/messages/@original.

        Edits the original deferred response for an interaction.
        """
        result = await self._call(
            "PATCH",
            f"/webhooks/{application_id}/{interaction_token}/messages/@original",
            json=self._safe_payload(payload),
        )
        assert result is not None, "edit_original_interaction_response must return a message"
        return result

    async def create_followup_message(
        self,
        application_id: str,
        interaction_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """POST /webhooks/{application_id}/{interaction_token}.

        Sends a follow-up message for an interaction (after the initial response).
        """
        result = await self._call(
            "POST",
            f"/webhooks/{application_id}/{interaction_token}",
            json=self._safe_payload(payload),
        )
        assert result is not None, "create_followup_message must return a message"
        return result

    async def get_channel(self, channel_id: str) -> dict[str, Any]:
        """GET /channels/{channel_id} — includes ``guild_id`` and ``permission_overwrites``."""
        result = await self._call("GET", f"/channels/{channel_id}")
        assert result is not None, "get_channel must return a channel object"
        return result

    async def get_guild_member(self, guild_id: str, user_id: str) -> dict[str, Any]:
        """GET /guilds/{guild_id}/members/{user_id} — the member's ``roles`` list."""
        result = await self._call("GET", f"/guilds/{guild_id}/members/{user_id}")
        assert result is not None, "get_guild_member must return a member object"
        return result

    async def get_guild_roles(self, guild_id: str) -> list[dict[str, Any]]:
        """GET /guilds/{guild_id}/roles — every role with its ``permissions`` bitfield."""
        result = await self._call("GET", f"/guilds/{guild_id}/roles")
        return result or []

    async def list_global_commands(
        self,
        application_id: str,
        *,
        with_localizations: bool = True,
    ) -> list[dict[str, Any]]:
        """GET /applications/{application_id}/commands.

        Returns every global application command currently registered —
        including ones Discord created on the app's behalf, such as the
        ``PRIMARY_ENTRY_POINT`` command that enabling Activities adds.

        ``with_localizations`` (default on) asks for the full
        ``name_localizations`` / ``description_localizations`` dictionaries.
        Without it Discord returns only the requester-locale ``*_localized``
        strings, so a caller that re-submits a fetched command would silently
        drop its translations.
        """
        params = {"with_localizations": "true"} if with_localizations else None
        result = await self._call(
            "GET",
            f"/applications/{application_id}/commands",
            params=params,
        )
        return result or []

    async def bulk_overwrite_global_commands(
        self,
        application_id: str,
        commands: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """PUT /applications/{application_id}/commands.

        Overwrites the entire list of global application commands.
        Returns the updated command list.

        Once Activities is enabled for the app, Discord rejects an overwrite
        that omits the app's ``PRIMARY_ENTRY_POINT`` command — use
        :func:`platform_shared.services.discord.commands.overwrite_global_commands_preserving_entry_point`
        for deploy-time registration.
        """
        result = await self._call(
            "PUT",
            f"/applications/{application_id}/commands",
            json=commands,
        )
        return result or []

    async def bulk_overwrite_guild_commands(
        self,
        application_id: str,
        guild_id: str,
        commands: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """PUT /applications/{application_id}/guilds/{guild_id}/commands.

        Overwrites the entire list of guild-specific application commands.
        Returns the updated command list.
        """
        result = await self._call(
            "PUT",
            f"/applications/{application_id}/guilds/{guild_id}/commands",
            json=commands,
        )
        return result or []

    async def list_application_emojis(self, application_id: str) -> list[dict[str, Any]]:
        """GET /applications/{application_id}/emojis.

        Application emojis (up to 2000) belong to the app rather than to a
        server, so the bot can use them in any guild or DM it can post in.
        Discord wraps the list as ``{"items": [...]}``; this returns the items.
        """
        result = await self._call("GET", f"/applications/{application_id}/emojis")
        if not result:
            return []
        return list(result.get("items", []))

    async def create_application_emoji(
        self,
        application_id: str,
        name: str,
        image_data_uri: str,
    ) -> dict[str, Any]:
        """POST /applications/{application_id}/emojis.

        ``name`` is 2-32 characters of ``[A-Za-z0-9_]`` and unique within the
        app; ``image_data_uri`` is a ``data:image/png;base64,...`` URI of at
        most 256 KiB. Returns the created emoji (with its ``id``).
        """
        result = await self._call(
            "POST",
            f"/applications/{application_id}/emojis",
            json={"name": name, "image": image_data_uri},
        )
        assert result is not None, "create_application_emoji must return an emoji object"
        return result

    async def delete_application_emoji(self, application_id: str, emoji_id: str) -> None:
        """DELETE /applications/{application_id}/emojis/{emoji_id}."""
        await self._call("DELETE", f"/applications/{application_id}/emojis/{emoji_id}")
