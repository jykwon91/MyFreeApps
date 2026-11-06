class InquiryReplySendFailedError(Exception):
    """Gmail definitely refused the reply: nothing was sent, so the host can retry."""
