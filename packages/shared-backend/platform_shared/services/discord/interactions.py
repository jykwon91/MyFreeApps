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
# Application command types (``data.type`` on an APPLICATION_COMMAND)
# ---------------------------------------------------------------------------

COMMAND_TYPE_CHAT_INPUT: Final = 1  # slash command
COMMAND_TYPE_USER: Final = 2        # right-click a member → Apps
COMMAND_TYPE_MESSAGE: Final = 3     # right-click a message → Apps

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
COMPONENT_TYPE_TEXT_INPUT: Final = 4  # modals only
COMPONENT_TYPE_USER_SELECT: Final = 5
COMPONENT_TYPE_ROLE_SELECT: Final = 6
COMPONENT_TYPE_MENTIONABLE_SELECT: Final = 7
COMPONENT_TYPE_CHANNEL_SELECT: Final = 8
COMPONENT_TYPE_TEXT_DISPLAY: Final = 10
# Wraps one modal input with its ``label`` (≤ 45 chars) and optional
# ``description`` (≤ 100); the modal layout Discord recommends over
# action rows of text inputs.
COMPONENT_TYPE_LABEL: Final = 18

# ---------------------------------------------------------------------------
# Text input styles
# ---------------------------------------------------------------------------

TEXT_INPUT_STYLE_SHORT: Final = 1      # one line
TEXT_INPUT_STYLE_PARAGRAPH: Final = 2  # several lines

# ---------------------------------------------------------------------------
# Button styles
# ---------------------------------------------------------------------------

BUTTON_STYLE_PRIMARY: Final = 1    # blurple
BUTTON_STYLE_SECONDARY: Final = 2  # grey
BUTTON_STYLE_SUCCESS: Final = 3    # green
BUTTON_STYLE_DANGER: Final = 4     # red
BUTTON_STYLE_LINK: Final = 5       # grey + URL; requires `url` field
