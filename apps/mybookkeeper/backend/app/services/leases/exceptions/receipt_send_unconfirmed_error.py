class ReceiptSendUnconfirmedError(Exception):
    """Gmail may have sent the receipt; the row stays ``sending`` until a later attempt checks Gmail."""
