"""Post-update field view, used to re-validate a PATCH before it flushes.

A partial update can violate a cross-field rule using a value it did not send —
clearing ``premium_frequency`` while a stored ``premium_cents`` stays put, say.
Validating the merged result turns that into a 422 instead of an IntegrityError
surfacing as a 500.
"""
from __future__ import annotations

from typing import Any


class MergedPolicy:
    """The fields a stored policy would have once ``fields`` is applied."""

    def __init__(self, policy: Any, fields: dict[str, Any]) -> None:
        for name in (
            "premium_cents",
            "premium_frequency",
        ):
            setattr(self, name, fields.get(name, getattr(policy, name)))
