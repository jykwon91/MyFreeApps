from app.core.gmail_connect_failure import GmailConnectFailure
from app.services.integrations.gmail_connect_error import GmailConnectError


class GmailConnectNotAllowedError(GmailConnectError):
    """The user who started a Gmail connection can no longer connect it for that workspace."""

    def __init__(self, message: str) -> None:
        super().__init__(GmailConnectFailure.NOT_ALLOWED, message)
