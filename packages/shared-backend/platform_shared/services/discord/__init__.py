"""Discord shared primitives for MyFreeApps.

App-agnostic building blocks for an HTTP-interactions Discord bot:

- :mod:`~platform_shared.services.discord.signature` — Ed25519 request verification
- :mod:`~platform_shared.services.discord.client` — async REST client with rate limiting
- :mod:`~platform_shared.services.discord.interactions` — interaction/response type constants
- :mod:`~platform_shared.services.discord.permissions` — permission bits + channel-permission computation

Quick-start::

    from platform_shared.services.discord import (
        DiscordRestClient,
        make_discord_dependency,
        INTERACTION_TYPE_PING,
        CALLBACK_TYPE_PONG,
    )
"""
from .client import (
    CANNOT_SEND_MESSAGES_TO_USER,
    MISSING_ACCESS,
    MISSING_PERMISSIONS,
    UNKNOWN_CHANNEL,
    UNKNOWN_INTERACTION,
    UNKNOWN_MESSAGE,
    DiscordApiError,
    DiscordRestClient,
)
from .interactions import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_LINK,
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    BUTTON_STYLE_SUCCESS,
    CALLBACK_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
    CALLBACK_TYPE_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    CALLBACK_TYPE_DEFERRED_UPDATE_MESSAGE,
    CALLBACK_TYPE_MODAL,
    CALLBACK_TYPE_PONG,
    CALLBACK_TYPE_UPDATE_MESSAGE,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    COMPONENT_TYPE_STRING_SELECT,
    INTERACTION_TYPE_APPLICATION_COMMAND,
    INTERACTION_TYPE_AUTOCOMPLETE,
    INTERACTION_TYPE_MESSAGE_COMPONENT,
    INTERACTION_TYPE_MODAL_SUBMIT,
    INTERACTION_TYPE_PING,
    MESSAGE_FLAG_EPHEMERAL,
    MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
)
from .permissions import (
    ADMINISTRATOR,
    EMBED_LINKS,
    MANAGE_EVENTS,
    MANAGE_GUILD,
    MENTION_EVERYONE,
    SEND_MESSAGES,
    VIEW_CHANNEL,
    compute_channel_permissions,
    has_permission,
    missing_permissions,
    parse_bitfield,
    permission_labels,
)
from .signature import (
    TIMESTAMP_TOLERANCE_S,
    DiscordSignatureError,
    make_discord_dependency,
    verify_discord_request,
    verify_discord_signature,
)

__all__ = [
    # client
    "DiscordApiError",
    "DiscordRestClient",
    "CANNOT_SEND_MESSAGES_TO_USER",
    "MISSING_ACCESS",
    "MISSING_PERMISSIONS",
    "UNKNOWN_CHANNEL",
    "UNKNOWN_INTERACTION",
    "UNKNOWN_MESSAGE",
    # interactions
    "BUTTON_STYLE_DANGER",
    "BUTTON_STYLE_LINK",
    "BUTTON_STYLE_PRIMARY",
    "BUTTON_STYLE_SECONDARY",
    "BUTTON_STYLE_SUCCESS",
    "CALLBACK_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT",
    "CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE",
    "CALLBACK_TYPE_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE",
    "CALLBACK_TYPE_DEFERRED_UPDATE_MESSAGE",
    "CALLBACK_TYPE_MODAL",
    "CALLBACK_TYPE_PONG",
    "CALLBACK_TYPE_UPDATE_MESSAGE",
    "COMPONENT_TYPE_ACTION_ROW",
    "COMPONENT_TYPE_BUTTON",
    "COMPONENT_TYPE_STRING_SELECT",
    "INTERACTION_TYPE_APPLICATION_COMMAND",
    "INTERACTION_TYPE_AUTOCOMPLETE",
    "INTERACTION_TYPE_MESSAGE_COMPONENT",
    "INTERACTION_TYPE_MODAL_SUBMIT",
    "INTERACTION_TYPE_PING",
    "MESSAGE_FLAG_EPHEMERAL",
    "MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS",
    # permissions
    "ADMINISTRATOR",
    "EMBED_LINKS",
    "MANAGE_EVENTS",
    "MANAGE_GUILD",
    "MENTION_EVERYONE",
    "SEND_MESSAGES",
    "VIEW_CHANNEL",
    "compute_channel_permissions",
    "has_permission",
    "missing_permissions",
    "parse_bitfield",
    "permission_labels",
    # signature
    "DiscordSignatureError",
    "TIMESTAMP_TOLERANCE_S",
    "make_discord_dependency",
    "verify_discord_request",
    "verify_discord_signature",
]
