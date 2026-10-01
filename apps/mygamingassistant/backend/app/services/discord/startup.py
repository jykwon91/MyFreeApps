"""Discord bot startup: the boot guard, then the raid bot's icon warm-up.

Called once from ``app.main._on_startup``.
"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.services.discord import emojis

logger = logging.getLogger(__name__)


class DiscordNotConfiguredError(RuntimeError):
    """Raised at startup when DISCORD_ENABLED=true but required Discord vars are missing."""


def check_discord_configured() -> None:
    """Fail loud in production when DISCORD_ENABLED=true but required vars are missing.

    Required when ``discord_enabled=True``:
      - ``discord_application_id``  (DISCORD_APPLICATION_ID)
      - ``discord_public_key``      (DISCORD_PUBLIC_KEY)
      - ``discord_bot_token``       (DISCORD_BOT_TOKEN)

    ``discord_dev_guild_id`` is optional (empty = register commands globally).

    In production: raises :exc:`DiscordNotConfiguredError`.
    In non-production: logs WARNING (Discord routes will still be mounted but
    Ed25519 verification will reject every request until the key is set).
    """
    if not settings.discord_enabled:
        return

    missing = [
        name
        for name, val in [
            ("DISCORD_APPLICATION_ID", settings.discord_application_id),
            ("DISCORD_PUBLIC_KEY", settings.discord_public_key),
            ("DISCORD_BOT_TOKEN", settings.discord_bot_token),
        ]
        if not val
    ]
    if not missing:
        return

    msg = (
        f"DISCORD_ENABLED=true but the following required vars are not set: "
        f"{', '.join(missing)}. "
        "Set them in apps/mygamingassistant/backend/.env.docker, or set "
        "DISCORD_ENABLED=false to disable the Discord bot."
    )
    if settings.environment == "production":
        raise DiscordNotConfiguredError(msg)
    logger.warning("_on_startup: %s (non-production — Discord will not verify requests)", msg)


def start_discord() -> None:
    """Run the boot guard, then warm the icon registry in the background.

    The warm-up never blocks boot: posts render text tags such as "[WAR]"
    until the icons are listed.
    """
    check_discord_configured()
    emojis.start_refresh()
