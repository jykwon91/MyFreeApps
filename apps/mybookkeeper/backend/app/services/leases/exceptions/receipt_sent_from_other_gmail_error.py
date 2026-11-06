class ReceiptSentFromOtherGmailError(Exception):
    """An earlier send of this receipt went through a Gmail account that's no longer connected.

    The row stays ``sending`` and nothing is emailed: the receipt may already
    be with the tenant. Reconnecting that account settles it, or the host can
    dismiss it.
    """

    def __init__(self, sender_gmail_address: str) -> None:
        super().__init__("This receipt may already have been sent from a Gmail account that is no longer connected.")
        self.sender_gmail_address = sender_gmail_address
