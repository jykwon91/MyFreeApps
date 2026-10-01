"""Discord HTTP interactions endpoint — POST /discord/interactions.

Public URL:  https://mygamingassistant.myfreeapps.org/api/discord/interactions
FastAPI path: /discord/interactions  (Caddy strips the /api prefix; see
              apps/mygamingassistant/docker/Caddyfile.docker ``handle /api/*``).

This module is only mounted when ``settings.discord_enabled=True`` (see
``app/main.py _mount_public_routes``).  When disabled, the route is absent
(404) — fail-closed, nothing leaks.

Interaction flow
----------------
Discord sends a signed POST on every interaction (slash command, button, ...).
We MUST respond within 3 seconds.  This handler:

  1. Ed25519 signature verification — ``verify_discord`` dependency raises
     HTTPException(401) on any failure (bad signature, stale timestamp,
     missing headers).  Discord validates this on Interactions Endpoint URL
     save; if we 401, they won't accept the URL.

  2. PING (type 1) → immediate PONG (type 1).

  3. APPLICATION_COMMAND (type 2) → dispatched by command name through
     ``app.services.discord.dispatcher.dispatch_application_command``.
     Exceptions are caught here: we always return an ephemeral error message
     rather than letting a 500 propagate (Discord would show the interaction
     as "failed" with no message, which is worse UX).

  4. MESSAGE_COMPONENT (type 3) → dispatched by custom_id prefix through
     ``dispatch_message_component`` (wired for future PRs; currently returns
     ephemeral "Unknown component").

  5. Any other type → ephemeral "Unsupported interaction type" (safe fallback).

Signature verification
-----------------------
``verify_discord`` reads ``settings.discord_public_key`` at call time so
tests can monkeypatch the key without rebuilding the app.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request

from platform_shared.services.discord import (
    CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
    CALLBACK_TYPE_PONG,
    INTERACTION_TYPE_APPLICATION_COMMAND,
    INTERACTION_TYPE_MESSAGE_COMPONENT,
    INTERACTION_TYPE_PING,
    MESSAGE_FLAG_EPHEMERAL,
)
from platform_shared.services.discord.signature import verify_discord_request

from app.core.config import settings
from app.services.discord.dispatcher import (
    dispatch_application_command,
    dispatch_message_component,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discord", tags=["discord"])


async def verify_discord(request: Request) -> Any:
    """FastAPI dependency: verify Discord Ed25519 signature + return parsed JSON.

    Reads ``settings.discord_public_key`` at request time so tests can
    monkeypatch the key via ``monkeypatch.setattr(settings, "discord_public_key",
    test_key_hex)``.  Raises HTTPException(401) on any signature failure.
    """
    return await verify_discord_request(
        request, public_key_hex=settings.discord_public_key
    )


def _ephemeral(content: str) -> dict[str, Any]:
    """Return an ephemeral channel message (visible only to the invoking user)."""
    return {
        "type": CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
        "data": {
            "content": content,
            "flags": MESSAGE_FLAG_EPHEMERAL,
        },
    }


@router.post("/interactions")
async def interactions(payload: Any = Depends(verify_discord)) -> dict[str, Any]:
    """Handle all Discord interactions.

    Must respond within 3 seconds.  All handlers in this file are synchronous
    or perform no outbound I/O in this PR, so the budget is never at risk.
    """
    interaction_type: int = payload.get("type", 0)

    # --- PING: Discord uses this to verify the interactions endpoint URL ---
    if interaction_type == INTERACTION_TYPE_PING:
        return {"type": CALLBACK_TYPE_PONG}

    # --- Slash commands ---
    if interaction_type == INTERACTION_TYPE_APPLICATION_COMMAND:
        try:
            return await dispatch_application_command(payload)
        except Exception:
            logger.exception(
                "Unhandled exception in Discord command handler: command=%r",
                payload.get("data", {}).get("name"),
            )
            return _ephemeral("Something went wrong. Please try again later.")

    # --- Button / select-menu components ---
    if interaction_type == INTERACTION_TYPE_MESSAGE_COMPONENT:
        try:
            return await dispatch_message_component(payload)
        except Exception:
            logger.exception(
                "Unhandled exception in Discord component handler: custom_id=%r",
                payload.get("data", {}).get("custom_id"),
            )
            return _ephemeral("Something went wrong. Please try again later.")

    # --- Unknown / unsupported type ---
    logger.warning(
        "Discord: received unsupported interaction type %r — returning safe fallback",
        interaction_type,
    )
    return _ephemeral("Unsupported interaction type.")
