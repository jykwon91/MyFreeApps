class ReceiptGmailSendError(Exception):
    """Gmail definitely rejected the message for a non-auth reason; nothing was sent.

    The message becomes the reply's ``detail``. It carries the fixed copy of a
    ``GmailSendError`` or ``GmailAccountUnknownError``, never raw provider text.
    """
