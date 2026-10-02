"""Guild scheduled events and threads — :class:`DiscordRestClient`'s methods for them.

A mixin the client inherits, kept apart so ``client.py`` stays small.  Each
method is one ``_call``: a refusal raises ``DiscordApiError`` carrying
Discord's ``code``, and the codes these routes answer with are named here.

https://discord.com/developers/docs/resources/guild-scheduled-event
https://discord.com/developers/docs/resources/channel#start-thread-from-message
"""
from typing import TYPE_CHECKING, Any, Final

# ---------------------------------------------------------------------------
# Discord error codes these routes answer with
# https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-error-codes
# ---------------------------------------------------------------------------

UNKNOWN_GUILD_SCHEDULED_EVENT: Final = 10070
# The server has 100 events that haven't ended, Discord's limit.
MAX_SCHEDULED_EVENTS: Final = 30038
INVALID_FORM_BODY: Final = 50035
THREAD_ARCHIVED: Final = 50083
# The message already has a thread (whoever started it); its id is the message's.
THREAD_ALREADY_CREATED: Final = 160004
THREAD_LOCKED: Final = 160005
MAX_ACTIVE_THREADS: Final = 160006
# The event has ended (or was cancelled): it can't be changed any more.
EVENT_FINISHED: Final = 180000


class ScheduledEventsAndThreads:
    """Scheduled events (needing Create Events or Manage Events) and threads started from a message."""

    if TYPE_CHECKING:

        async def _call(
            self, method: str, path: str, json: Any = None, params: dict[str, str] | None = None
        ) -> Any: ...

    async def create_guild_scheduled_event(self, guild_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /guilds/{guild_id}/scheduled-events — returns the event (its ``id``, ``creator_id``)."""
        result = await self._call("POST", f"/guilds/{guild_id}/scheduled-events", json=payload)
        assert result is not None, "create_guild_scheduled_event must return an event"
        return result

    async def list_guild_scheduled_events(self, guild_id: str) -> list[dict[str, Any]]:
        """GET /guilds/{guild_id}/scheduled-events — the server's events that haven't ended."""
        result = await self._call("GET", f"/guilds/{guild_id}/scheduled-events")
        return result or []

    async def modify_guild_scheduled_event(
        self, guild_id: str, event_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """PATCH /guilds/{guild_id}/scheduled-events/{event_id} — only the fields in *payload* change."""
        result = await self._call("PATCH", f"/guilds/{guild_id}/scheduled-events/{event_id}", json=payload)
        assert result is not None, "modify_guild_scheduled_event must return an event"
        return result

    async def delete_guild_scheduled_event(self, guild_id: str, event_id: str) -> None:
        """DELETE /guilds/{guild_id}/scheduled-events/{event_id}; one already gone raises 10070."""
        await self._call("DELETE", f"/guilds/{guild_id}/scheduled-events/{event_id}")

    async def start_thread_from_message(
        self, channel_id: str, message_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /channels/{channel_id}/messages/{message_id}/threads — a public thread on the message.

        Needs Create Public Threads.  The thread's id is the message's; a
        message that already has one raises ``THREAD_ALREADY_CREATED``.
        """
        result = await self._call("POST", f"/channels/{channel_id}/messages/{message_id}/threads", json=payload)
        assert result is not None, "start_thread_from_message must return a channel"
        return result

    async def modify_thread(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """PATCH /channels/{thread_id} — rename, archive or unarchive a thread (``name``, ``archived``)."""
        result = await self._call("PATCH", f"/channels/{thread_id}", json=payload)
        assert result is not None, "modify_thread must return a channel"
        return result
