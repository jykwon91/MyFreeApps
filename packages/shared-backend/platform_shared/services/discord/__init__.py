"""Discord shared primitives for MyFreeApps.

App-agnostic building blocks for an HTTP-interactions Discord bot:

- :mod:`~platform_shared.services.discord.signature` — Ed25519 request verification
- :mod:`~platform_shared.services.discord.client` — async REST client with rate limiting
- :mod:`~platform_shared.services.discord.client_events` — the client's scheduled-event and thread methods
- :mod:`~platform_shared.services.discord.client_files` — the client's file uploads (an interaction reply's attachments)
- :mod:`~platform_shared.services.discord.client_members` — the client's member list (needs the Server Members intent)
- :mod:`~platform_shared.services.discord.commands` — global command overwrite that keeps an Activity entry point
- :mod:`~platform_shared.services.discord.emojis` — versioned application-emoji sync + per-process registry
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
    CANNOT_REPLY_WITHOUT_READ_HISTORY,
    CANNOT_SEND_MESSAGES_TO_USER,
    MISSING_ACCESS,
    MISSING_PERMISSIONS,
    UNKNOWN_CHANNEL,
    UNKNOWN_INTERACTION,
    UNKNOWN_MESSAGE,
    DiscordApiError,
    DiscordRestClient,
)
from .client_events import (
    EVENT_FINISHED,
    INVALID_FORM_BODY,
    MAX_ACTIVE_THREADS,
    MAX_SCHEDULED_EVENTS,
    THREAD_ALREADY_CREATED,
    THREAD_ARCHIVED,
    THREAD_LOCKED,
    UNKNOWN_GUILD_SCHEDULED_EVENT,
    ScheduledEventsAndThreads,
)
from .client_files import DiscordFile, InteractionFiles
from .client_members import GuildMembers
from .commands import (
    COMMAND_TYPE_PRIMARY_ENTRY_POINT,
    ENTRY_POINT_HANDLER_DISCORD_LAUNCH_ACTIVITY,
    ENTRY_POINT_REMOVAL_REJECTED,
    entry_points_to_carry,
    is_entry_point_command,
    overwrite_global_commands_preserving_entry_point,
)
from .emojis import (
    EMPTY_EMOJIS,
    EmojiAsset,
    EmojiRef,
    EmojiRegistry,
    EmojiSet,
    SyncReport,
    expected_names,
    load_assets,
    sync_application_emojis,
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
    COMMAND_TYPE_CHAT_INPUT,
    COMMAND_TYPE_MESSAGE,
    COMMAND_TYPE_USER,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    COMPONENT_TYPE_CHANNEL_SELECT,
    COMPONENT_TYPE_LABEL,
    COMPONENT_TYPE_MENTIONABLE_SELECT,
    COMPONENT_TYPE_ROLE_SELECT,
    COMPONENT_TYPE_STRING_SELECT,
    COMPONENT_TYPE_TEXT_DISPLAY,
    COMPONENT_TYPE_TEXT_INPUT,
    COMPONENT_TYPE_USER_SELECT,
    INTERACTION_TYPE_APPLICATION_COMMAND,
    INTERACTION_TYPE_AUTOCOMPLETE,
    INTERACTION_TYPE_MESSAGE_COMPONENT,
    INTERACTION_TYPE_MODAL_SUBMIT,
    INTERACTION_TYPE_PING,
    MESSAGE_FLAG_EPHEMERAL,
    MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
    TEXT_INPUT_STYLE_PARAGRAPH,
    TEXT_INPUT_STYLE_SHORT,
)
from .permissions import (
    ADMINISTRATOR,
    CREATE_EVENTS,
    CREATE_PUBLIC_THREADS,
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
    "CANNOT_REPLY_WITHOUT_READ_HISTORY",
    "CANNOT_SEND_MESSAGES_TO_USER",
    "MISSING_ACCESS",
    "MISSING_PERMISSIONS",
    "UNKNOWN_CHANNEL",
    "UNKNOWN_INTERACTION",
    "UNKNOWN_MESSAGE",
    # client_events
    "EVENT_FINISHED",
    "INVALID_FORM_BODY",
    "MAX_ACTIVE_THREADS",
    "MAX_SCHEDULED_EVENTS",
    "THREAD_ALREADY_CREATED",
    "THREAD_ARCHIVED",
    "THREAD_LOCKED",
    "UNKNOWN_GUILD_SCHEDULED_EVENT",
    "ScheduledEventsAndThreads",
    # client_files
    "DiscordFile",
    "InteractionFiles",
    # client_members
    "GuildMembers",
    # commands
    "COMMAND_TYPE_PRIMARY_ENTRY_POINT",
    "ENTRY_POINT_HANDLER_DISCORD_LAUNCH_ACTIVITY",
    "ENTRY_POINT_REMOVAL_REJECTED",
    "entry_points_to_carry",
    "is_entry_point_command",
    "overwrite_global_commands_preserving_entry_point",
    # emojis
    "EMPTY_EMOJIS",
    "EmojiAsset",
    "EmojiRef",
    "EmojiRegistry",
    "EmojiSet",
    "SyncReport",
    "expected_names",
    "load_assets",
    "sync_application_emojis",
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
    "COMMAND_TYPE_CHAT_INPUT",
    "COMMAND_TYPE_MESSAGE",
    "COMMAND_TYPE_USER",
    "COMPONENT_TYPE_ACTION_ROW",
    "COMPONENT_TYPE_BUTTON",
    "COMPONENT_TYPE_CHANNEL_SELECT",
    "COMPONENT_TYPE_LABEL",
    "COMPONENT_TYPE_MENTIONABLE_SELECT",
    "COMPONENT_TYPE_ROLE_SELECT",
    "COMPONENT_TYPE_STRING_SELECT",
    "COMPONENT_TYPE_TEXT_DISPLAY",
    "COMPONENT_TYPE_TEXT_INPUT",
    "COMPONENT_TYPE_USER_SELECT",
    "INTERACTION_TYPE_APPLICATION_COMMAND",
    "INTERACTION_TYPE_AUTOCOMPLETE",
    "INTERACTION_TYPE_MESSAGE_COMPONENT",
    "INTERACTION_TYPE_MODAL_SUBMIT",
    "INTERACTION_TYPE_PING",
    "MESSAGE_FLAG_EPHEMERAL",
    "MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS",
    "TEXT_INPUT_STYLE_PARAGRAPH",
    "TEXT_INPUT_STYLE_SHORT",
    # permissions
    "ADMINISTRATOR",
    "CREATE_EVENTS",
    "CREATE_PUBLIC_THREADS",
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
