class ReceiptGmailSendError(Exception):
    """Gmail definitely rejected the message for a non-auth reason; nothing was sent."""
