"""``property_id`` on a lease is not one of the organization's properties."""
from __future__ import annotations


class LeasePropertyNotFoundError(LookupError):
    pass
