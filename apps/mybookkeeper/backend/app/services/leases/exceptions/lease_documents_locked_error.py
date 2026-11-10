"""The lease's generated documents can no longer be re-rendered."""
from __future__ import annotations


class LeaseDocumentsLockedError(ValueError):
    pass
