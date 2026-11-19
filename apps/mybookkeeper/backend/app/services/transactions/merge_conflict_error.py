class MergeConflictError(ValueError):
    """The rows being combined are linked to different tenants, vendors or activities."""
