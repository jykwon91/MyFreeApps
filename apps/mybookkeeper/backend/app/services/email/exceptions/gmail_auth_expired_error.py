class GmailAuthExpiredError(Exception):
    """Raised when Google rejects the stored Gmail refresh token.

    Happens when the user revokes access, changes password, or when the
    OAuth app is still in "Testing" status (Google invalidates test
    refresh tokens every 7 days). The user must disconnect and reconnect
    Gmail to resolve.
    """
