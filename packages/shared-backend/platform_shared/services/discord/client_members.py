"""A server's members — :class:`DiscordRestClient`'s method for them.

A mixin the client inherits, kept apart so ``client.py`` stays small.  Listing
a server's members needs the **Server Members** privileged intent, switched on
for the bot in the Developer Portal (Bot → Privileged Gateway Intents).  With
it off Discord refuses the list with 403 ``MISSING_ACCESS`` (50001); a refusal
raises ``DiscordApiError`` carrying Discord's ``code``.

A page holds at most 1000 members, in ascending id order: the next page starts
``after`` the highest id on this one.

https://discord.com/developers/docs/resources/guild#list-guild-members
https://discord.com/developers/docs/events/gateway#privileged-intents
"""
from typing import TYPE_CHECKING, Any


class GuildMembers:
    """One page of a server's members (needing the Server Members intent)."""

    if TYPE_CHECKING:

        async def _call(
            self, method: str, path: str, json: Any = None, params: dict[str, str] | None = None
        ) -> Any: ...

    async def list_guild_members(self, guild_id: str, *, limit: int = 1000, after: str = "0") -> list[dict[str, Any]]:
        """GET /guilds/{guild_id}/members — up to ``limit`` members whose ids come after ``after``.

        Each is a guild member object: its ``user`` (``id``, ``username``,
        ``global_name``, ``bot``), ``nick``, ``roles`` (role ids) and ``pending``.
        """
        result = await self._call(
            "GET", f"/guilds/{guild_id}/members", params={"limit": str(limit), "after": after}
        )
        return result or []
