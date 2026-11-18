from enum import StrEnum


class GmailConnectFailure(StrEnum):
    """Why a Gmail connection didn't finish: the ``reason`` the phone is sent back with.

    Mirrored by ``GmailConnectFailure`` in ``api-client/src/types/integration/gmail-connect-failure.ts``;
    a value added here must be added there in the same PR.
    """

    # The person said no on Google's consent screen.
    DENIED = "denied"
    # The 10-minute state ran out, or a password change ended the session that started it.
    EXPIRED = "expired"
    # They were removed from the workspace, or made a viewer, since starting it.
    NOT_ALLOWED = "not_allowed"
    # Google sent no refresh token, so the connection couldn't outlive the hour.
    NO_REFRESH_TOKEN = "no_refresh_token"
    # The state isn't one this server signed, or is missing what the callback needs.
    INVALID_STATE = "invalid_state"
    # Anything else: Google refused the exchange, the account couldn't be read, or a server fault.
    FAILED = "failed"
