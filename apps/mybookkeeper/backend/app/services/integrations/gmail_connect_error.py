from app.core.gmail_connect_failure import GmailConnectFailure


class GmailConnectError(ValueError):
    """A Gmail connection the callback refused to finish, with the reason why.

    A ``ValueError``, so the website's callback still answers 400 with the message.
    """

    def __init__(self, failure: GmailConnectFailure, message: str) -> None:
        super().__init__(message)
        self.failure = failure
