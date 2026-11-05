class ReceiptSentNotRecordedError(Exception):
    """The email went out but marking the receipt sent failed; a later attempt finds it in Gmail and finishes."""
