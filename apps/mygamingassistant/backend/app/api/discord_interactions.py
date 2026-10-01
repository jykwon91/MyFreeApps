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
     ``dispatch_message_component`` (raid signup buttons, pickers, confirms).

  5. APPLICATION_COMMAND_AUTOCOMPLETE (type 4) → ``dispatch_autocomplete``;
     on any error, an empty choice list (autocomplete can't show messages).

  6. Any other type → ephemeral "Unsupported interaction type" (safe fallback).

3-second budget
---------------
Handlers do local DB work only (one transaction per interaction) and return
the callback body.  Outbound Discord REST calls (posting a raid, editing the
public post after a private flow, DMs) are queued on FastAPI
``BackgroundTasks`` and run after the response is sent — see
``app/services/discord/raid_publisher.py``.

Every interaction's age on arrival (now minus the creation time in its
snowflake ID) is logged, at WARNING once it has used most of the budget.
That splits a "This interaction failed" in two: a slow handler shows up as
a long duration on the request's ``POST /discord/interactions`` log line,
a request that reached us late as a large age here.

Signature verification
-----------------------
``verify_discord`` reads ``settings.discord_public_key`` at call time so
tests can monkeypatch the key without rebuilding the app.
"""
import logging
import time
from typing import Any, Final

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from platform_shared.services.discord import (
    CALLBACK_TYPE_PONG,
    INTERACTION_TYPE_APPLICATION_COMMAND,
    INTERACTION_TYPE_AUTOCOMPLETE,
    INTERACTION_TYPE_MESSAGE_COMPONENT,
    INTERACTION_TYPE_PING,
)
from platform_shared.services.discord.signature import verify_discord_request

from app.core.config import settings
from app.services.discord.dispatcher import (
    dispatch_application_command,
    dispatch_autocomplete,
    dispatch_message_component,
)
from app.services.discord.interaction import (
    autocomplete_response,
    ephemeral_response,
    snowflake_created_ms,
)
from app.services.discord.raid_copy import GENERIC_ERROR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discord", tags=["discord"])

# Discord fails an interaction it has no answer to 3 s after creating it.
_LATE_ARRIVAL_MS: Final = 2000


async def verify_discord(request: Request) -> Any:
    """FastAPI dependency: verify Discord Ed25519 signature + return parsed JSON.

    Reads ``settings.discord_public_key`` at request time so tests can
    monkeypatch the key via ``monkeypatch.setattr(settings, "discord_public_key",
    test_key_hex)``.  Raises HTTPException(401) on any signature failure.
    """
    return await verify_discord_request(
        request, public_key_hex=settings.discord_public_key
    )


def _log_arrival(payload: dict[str, Any]) -> None:
    """Log how old the interaction already is — see "3-second budget" above."""
    created_ms = snowflake_created_ms(payload.get("id"))
    if created_ms is None:
        return
    age_ms = int(time.time() * 1000) - created_ms
    data = payload.get("data")
    name = None
    if isinstance(data, dict):
        name = data.get("name") or data.get("custom_id")
    level = logging.WARNING if age_ms >= _LATE_ARRIVAL_MS else logging.INFO
    logger.log(level, "Discord interaction type=%s name=%r age_ms=%d", payload.get("type"), name, age_ms)


@router.post("/interactions")
async def interactions(
    background: BackgroundTasks,
    payload: Any = Depends(verify_discord),
) -> dict[str, Any]:
    """Handle all Discord interactions.

    Must respond within 3 seconds: handlers only touch the local database;
    Discord REST calls go on ``background`` and run after the response.
    """
    if not isinstance(payload, dict):
        return ephemeral_response("Unsupported interaction type.")
    _log_arrival(payload)
    interaction_type: int = payload.get("type", 0)

    # --- PING: Discord uses this to verify the interactions endpoint URL ---
    if interaction_type == INTERACTION_TYPE_PING:
        return {"type": CALLBACK_TYPE_PONG}

    # --- Slash commands ---
    if interaction_type == INTERACTION_TYPE_APPLICATION_COMMAND:
        try:
            return await dispatch_application_command(payload, background)
        except Exception:
            logger.exception(
                "Unhandled exception in Discord command handler: command=%r",
                payload.get("data", {}).get("name"),
            )
            return ephemeral_response(GENERIC_ERROR)

    # --- Autocomplete suggestions for command options ---
    if interaction_type == INTERACTION_TYPE_AUTOCOMPLETE:
        try:
            return await dispatch_autocomplete(payload)
        except Exception:
            logger.exception(
                "Unhandled exception in Discord autocomplete handler: command=%r",
                payload.get("data", {}).get("name"),
            )
            return autocomplete_response([])

    # --- Button / select-menu components ---
    if interaction_type == INTERACTION_TYPE_MESSAGE_COMPONENT:
        try:
            return await dispatch_message_component(payload, background)
        except Exception:
            logger.exception(
                "Unhandled exception in Discord component handler: custom_id=%r",
                payload.get("data", {}).get("custom_id"),
            )
            return ephemeral_response(GENERIC_ERROR)

    # --- Unknown / unsupported type ---
    logger.warning(
        "Discord: received unsupported interaction type %r — returning safe fallback",
        interaction_type,
    )
    return ephemeral_response("Unsupported interaction type.")
