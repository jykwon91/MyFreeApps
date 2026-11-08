"""Typed failures of the chat relay. ``code`` is the fixed detail the browser routes on.

The route maps each class to an HTTP status (``app/api/wow_chat.py``); the
service never decides statuses. ``error_type`` (Anthropic failures only) is
the documented upstream ``error.type`` for logs.
"""


class WowChatError(Exception):
    def __init__(self, code: str, *, error_type: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.error_type = error_type or code


class ChatInputError(WowChatError):
    """The request's shape is wrong (422)."""


class ChatTooLargeError(WowChatError):
    """A length or count limit is exceeded (413). Never trimmed silently."""


class ChatTicketInvalidError(WowChatError):
    """Missing, forged or mismatched ticket (400): the browser starts a new chat."""


class ChatTicketExpiredError(WowChatError):
    """Ticket past its expiry, or issued to another network (409): new chat."""


class ChatRoundsExhaustedError(WowChatError):
    """No tool rounds left for this question (409)."""


class ChatDailyCapError(WowChatError):
    """The global or per-network daily token budget is spent (429 until UTC midnight)."""


class ChatUpstreamBusyError(WowChatError):
    """Anthropic rate-limited us (429, retry in a minute)."""


class ChatUpstreamError(WowChatError):
    """Anthropic failed, is misconfigured or returned nothing usable (503)."""
