class InquiryReplyInProgressError(Exception):
    """An earlier attempt of this reply (same client request id) is still sending."""
