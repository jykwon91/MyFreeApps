"""Describe email recipients for logs without writing their addresses."""
from __future__ import annotations

from collections.abc import Sequence


def describe_recipients(recipients: Sequence[str]) -> str:
    """``"2 recipient(s) at example.com, example.org"``: the count and the domains only."""
    domains = sorted({address.rpartition("@")[2].strip().lower() or "unknown" for address in recipients})
    return f"{len(recipients)} recipient(s) at {', '.join(domains) or 'unknown'}"


__all__ = ["describe_recipients"]
