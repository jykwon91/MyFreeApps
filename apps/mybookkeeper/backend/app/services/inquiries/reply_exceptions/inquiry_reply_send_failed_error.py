class InquiryReplySendFailedError(Exception):
    """Gmail definitely refused the reply: nothing was sent, so the host can retry.

    The message becomes the reply's ``detail``. It carries the fixed copy of a
    ``GmailSendError`` or ``GmailAccountUnknownError``, never raw provider text.
    """
