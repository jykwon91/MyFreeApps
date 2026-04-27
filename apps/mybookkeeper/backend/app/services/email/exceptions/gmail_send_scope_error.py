class GmailSendScopeError(Exception):
    """Raised when the host's Gmail integration lacks ``gmail.send`` scope.

    Happens when:
    - The host connected Gmail before PR 2.3 (only requested gmail.readonly)
    - The host explicitly denied the send scope at consent time

    Resolution: surface 422 with an actionable message instructing the host
    to reconnect Gmail. Existing readonly access is preserved — the
    reconnect flow simply requests the broader scope set.
    """
