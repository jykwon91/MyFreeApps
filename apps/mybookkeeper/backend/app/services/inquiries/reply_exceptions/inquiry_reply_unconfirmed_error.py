class InquiryReplyUnconfirmedError(Exception):
    """Gmail may or may not have sent the reply.

    The claim is left in place, so a retry with the same client request id
    looks the reply up in Gmail instead of sending it again.
    """
