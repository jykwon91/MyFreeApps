class TotpSetupNotStartedError(Exception):
    """A code was sent to finish enrollment, but no enrollment is in progress."""
