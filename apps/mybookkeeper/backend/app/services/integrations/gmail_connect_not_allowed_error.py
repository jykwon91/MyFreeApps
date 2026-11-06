class GmailConnectNotAllowedError(ValueError):
    """The user who started a Gmail connection can no longer connect it for that workspace.

    A ``ValueError``, so the callback route answers 400 as for any other bad state.
    """
