"""Shared Discord Activity config router — one public, read-only endpoint.

A Discord Activity (the app iframed inside Discord at
``https://<client_id>.discordsays.com``) must construct the Embedded App SDK
with the application's client id before it can talk to the Discord client.
The SPA fetches it at boot rather than baking it into the bundle, so no app
needs another frontend build arg (and the Dockerfile → compose → workflow
chain that comes with one) for a value the backend already holds:

    GET /discord/activity-config  → {"client_id": "<application id>"}

Apps mount it only when their Discord integration is configured — disabled
is absent (404), never present-but-empty — so the SPA shows its in-Discord
error state instead of booting the SDK with a bogus id. Resource-level path,
no ``/api`` prefix (Caddy strips it), like every other platform router.

Usage::

    if settings.discord_enabled and settings.discord_application_id:
        app.include_router(
            build_discord_activity_router(client_id=settings.discord_application_id)
        )
"""
from __future__ import annotations

from fastapi import APIRouter

from platform_shared.schemas.discord_activity import DiscordActivityConfigResponse


def build_discord_activity_router(*, client_id: str) -> APIRouter:
    """Construct the public ``GET /discord/activity-config`` router.

    Args:
        client_id: The Discord application (OAuth2 client) id. Must be
            non-empty — mount the router conditionally instead of passing "".

    Raises:
        ValueError: ``client_id`` is empty.
    """
    if not client_id:
        raise ValueError(
            "build_discord_activity_router needs the Discord application id — "
            "only mount the router when the Discord integration is configured."
        )
    config = DiscordActivityConfigResponse(client_id=client_id)
    router = APIRouter(tags=["discord-activity"])

    @router.get(
        "/discord/activity-config",
        response_model=DiscordActivityConfigResponse,
    )
    async def get_discord_activity_config() -> DiscordActivityConfigResponse:
        return config

    return router
