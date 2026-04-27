class GmailSendError(Exception):
    """Raised when Gmail rejects an outbound message for a non-auth reason.

    Examples:
    - 400 malformed RFC 5322 message
    - 5xx transient Gmail outage
    - Network errors

    The caller (the inquiry-reply service) treats this as a hard failure:
    no InquiryMessage row is created and the inquiry stage doesn't advance.
    The host sees a clear error and can retry.
    """
