class ReceiptMissingLeaseError(Exception):
    """Tenant has no signed lease to file the receipt under; checked before emailing."""
