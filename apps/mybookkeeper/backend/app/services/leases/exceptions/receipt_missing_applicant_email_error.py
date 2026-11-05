class ReceiptMissingApplicantEmailError(Exception):
    """Tenant has no email on file — can't send the receipt."""
