"""The lease changed between rendering its documents and writing them."""
from __future__ import annotations


class LeaseChangedDuringRenderError(RuntimeError):
    pass
