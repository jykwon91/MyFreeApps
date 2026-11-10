"""A render snapshot was stamped on a lease-template link that does not exist."""
from __future__ import annotations


class SignedLeaseTemplateLinkMissingError(RuntimeError):
    pass
