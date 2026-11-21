class GmailTemporarilyUnavailableError(Exception):
    """Google is down or rate-limiting this connection (5xx, 429, 403 rate limit, or a
    retryable token-endpoint failure).

    The connection is fine, so ``needs_reauth`` is NOT set. Nothing is lost: the
    work is retried on the next sync cycle.
    """
