class InquiryReplySentNotRecordedError(Exception):
    """Gmail sent the reply but it couldn't be recorded.

    The claim is left in place, so a retry with the same client request id
    finds the reply in Gmail and records it.
    """
