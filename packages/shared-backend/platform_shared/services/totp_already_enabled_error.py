class TotpAlreadyEnabledError(Exception):
    """Enrollment was asked to start on an account that already has 2FA on."""
