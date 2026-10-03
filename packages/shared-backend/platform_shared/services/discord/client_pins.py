"""A channel's pins — :class:`DiscordRestClient`'s methods for them.

A mixin the client inherits, kept apart so ``client.py`` stays small.  Pinning
needs the **Pin Messages** permission (``PIN_MESSAGES``, bit 51), split from
Manage Messages and required since 2026-02-23.  Without it Discord refuses
with 403 ``MISSING_PERMISSIONS`` (50013); a channel holding its most pins
refuses with ``MAX_PINS`` (30003); a deleted message is 404
``UNKNOWN_MESSAGE`` (10008).  A refusal raises ``DiscordApiError`` carrying
Discord's ``code``.  Both calls answer 204, and pinning a pinned message (or
unpinning one that isn't) changes nothing.

``/channels/{channel_id}/pins/{message_id}`` is the deprecated route; these use
``/channels/{channel_id}/messages/pins/{message_id}``.

https://discord.com/developers/docs/resources/message#pin-message
https://discord.com/developers/docs/resources/message#unpin-message
"""
from typing import TYPE_CHECKING, Any, Final

# Discord's error code for a channel that holds its most pins.
MAX_PINS: Final = 30003


class MessagePins:
    """Pin and unpin a message (needing Pin Messages)."""

    if TYPE_CHECKING:

        async def _call(
            self, method: str, path: str, json: Any = None, params: dict[str, str] | None = None
        ) -> Any: ...

    async def pin_message(self, channel_id: str, message_id: str) -> None:
        """PUT /channels/{channel_id}/messages/pins/{message_id} — pin the message."""
        await self._call("PUT", f"/channels/{channel_id}/messages/pins/{message_id}")

    async def unpin_message(self, channel_id: str, message_id: str) -> None:
        """DELETE /channels/{channel_id}/messages/pins/{message_id} — unpin the message."""
        await self._call("DELETE", f"/channels/{channel_id}/messages/pins/{message_id}")
