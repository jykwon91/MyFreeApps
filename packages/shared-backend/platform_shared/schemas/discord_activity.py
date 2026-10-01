"""Wire shape for ``GET /discord/activity-config`` (see ``discord_activity_router``)."""
from __future__ import annotations

from pydantic import BaseModel


class DiscordActivityConfigResponse(BaseModel):
    """Public config a Discord Activity needs before the SDK handshake.

    Mirrors the frontend ``DiscordActivityConfig`` interface in
    ``@platform/ui/discord-activity`` field-for-field. ``client_id`` is the
    Discord application's OAuth2 client id — public by design (it is in every
    invite link and in the Activity's own ``<client_id>.discordsays.com`` host).
    """

    client_id: str
