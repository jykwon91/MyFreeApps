class GmailReauthRequiredError(Exception):
    """Raised when a Gmail API call fails because the stored refresh token is invalid.

    This wraps ``google.auth.exceptions.RefreshError`` (and 401 HttpErrors) that
    occur during any Gmail API call. It signals that:

    1. The ``Integration.needs_reauth`` flag has already been set to ``True``.
    2. All queued Gmail work for this integration should be skipped.
    3. The user must complete a new OAuth flow to recover.

    Use this instead of catching ``RefreshError`` directly in callers — the DB
    state has already been committed by the time this is raised.
    """
