"""A locked lease's original or signed document cannot be deleted or relabelled."""
from __future__ import annotations


class LeaseAttachmentLockedError(ValueError):
    pass
