class TotpAccountLockedError(Exception):
    """Enrollment was asked to start on an account that is locked out."""
