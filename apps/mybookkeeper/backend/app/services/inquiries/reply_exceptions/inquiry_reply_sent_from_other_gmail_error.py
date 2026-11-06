class InquiryReplySentFromOtherGmailError(Exception):
    """An earlier attempt of this reply went through a Gmail account that's no longer connected.

    Its claim can only be settled by searching that account's mailbox, so it
    is kept and the reply is not resent: it may already be in the inquirer's
    inbox. Reconnecting that account settles it; a new reply sends fresh.
    """

    def __init__(self, sender_gmail_address: str) -> None:
        super().__init__("This reply may already have been sent from a Gmail account that is no longer connected.")
        self.sender_gmail_address = sender_gmail_address
