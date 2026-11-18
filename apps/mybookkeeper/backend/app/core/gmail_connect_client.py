from enum import StrEnum


class GmailConnectClient(StrEnum):
    """Which app started a Gmail connection, and so where Google's answer is sent on to.

    The allowlist for ``GET /integrations/gmail/connect?client=``. It is signed into
    the OAuth state, so the callback never takes it from the request.
    """

    WEB = "web"
    MOBILE = "mobile"
