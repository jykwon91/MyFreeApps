from app.core.gmail_connect_failure import GmailConnectFailure


class GmailConnectError(ValueError):
    """A Gmail connection the server refused to finish, with the reason why.

    The route answers with ``failure`` as its ``detail``, so the app can say why.
    """

    def __init__(self, failure: GmailConnectFailure, message: str) -> None:
        super().__init__(message)
        self.failure = failure
