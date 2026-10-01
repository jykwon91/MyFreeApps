"""Discord interaction type, response type, and component constants.

Mirrors https://discord.com/developers/docs/interactions/receiving-and-responding.
Kept intentionally flat — no bespoke framework, just named constants so
application code avoids raw integers.
"""
from typing import Final

# ---------------------------------------------------------------------------
# Interaction types
# ---------------------------------------------------------------------------

INTERACTION_TYPE_PING: Final = 1
INTERACTION_TYPE_APPLICATION_COMMAND: Final = 2
INTERACTION_TYPE_MESSAGE_COMPONENT: Final = 3
INTERACTION_TYPE_AUTOCOMPLETE: Final = 4
INTERACTION_TYPE_MODAL_SUBMIT: Final = 5

# ---------------------------------------------------------------------------
# Interaction callback types
# ---------------------------------------------------------------------------

CALLBACK_TYPE_PONG: Final = 1
CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE: Final = 4
CALLBACK_TYPE_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: Final = 5
CALLBACK_TYPE_DEFERRED_UPDATE_MESSAGE: Final = 6
CALLBACK_TYPE_UPDATE_MESSAGE: Final = 7
CALLBACK_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: Final = 8
CALLBACK_TYPE_MODAL: Final = 9

# ---------------------------------------------------------------------------
# Message flags (bitfield)
# ---------------------------------------------------------------------------

MESSAGE_FLAG_EPHEMERAL: Final = 64
# Deliver the message without push/desktop notifications ("@silent").
MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS: Final = 4096

# ---------------------------------------------------------------------------
# Message component types
# ---------------------------------------------------------------------------

COMPONENT_TYPE_ACTION_ROW: Final = 1
COMPONENT_TYPE_BUTTON: Final = 2
COMPONENT_TYPE_STRING_SELECT: Final = 3

# ---------------------------------------------------------------------------
# Button styles
# ---------------------------------------------------------------------------

BUTTON_STYLE_PRIMARY: Final = 1    # blurple
BUTTON_STYLE_SECONDARY: Final = 2  # grey
BUTTON_STYLE_SUCCESS: Final = 3    # green
BUTTON_STYLE_DANGER: Final = 4     # red
BUTTON_STYLE_LINK: Final = 5       # grey + URL; requires `url` field
