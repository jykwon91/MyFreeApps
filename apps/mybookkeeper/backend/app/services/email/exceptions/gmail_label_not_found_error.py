class GmailLabelNotFoundError(Exception):
    """The Gmail connection is limited to a label the mailbox doesn't have.

    Syncing anyway would pull in every email instead of only the labelled
    ones, so the sync stops until the user fixes or clears the label.
    """

    def __init__(self, label: str) -> None:
        super().__init__(f"Gmail label {label!r} not found")
        self.label = label
