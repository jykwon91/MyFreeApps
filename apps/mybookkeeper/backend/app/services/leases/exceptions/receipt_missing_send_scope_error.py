class ReceiptMissingSendScopeError(Exception):
    """Gmail integration lacks gmail.send scope — host must reconnect."""
