class InquiryReplyAuthExpiredError(Exception):
    """Gmail token expired while trying to send the reply. User must reconnect Gmail."""
