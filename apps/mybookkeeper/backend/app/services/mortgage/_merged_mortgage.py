"""Post-update field view, used to re-validate a PATCH before it flushes.

A partial update can violate a cross-field rule using a value it did not send —
switching ``rate_type`` from ``arm`` to ``fixed`` while a stored ``fixed_until``
stays put, say. Validating the merged result turns that into a 422 instead of
an IntegrityError surfacing as a 500.
"""
from __future__ import annotations

from typing import Any


class MergedMortgage:
    """The fields a stored mortgage would have once ``fields`` is applied."""

    def __init__(self, mortgage: Any, fields: dict[str, Any]) -> None:
        for name in (
            "rate_type",
            "fixed_until",
            "current_balance_cents",
            "statement_date",
        ):
            setattr(self, name, fields.get(name, getattr(mortgage, name)))
