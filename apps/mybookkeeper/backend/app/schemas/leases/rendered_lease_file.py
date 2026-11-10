"""A rendered lease document already uploaded to storage, ready to be recorded."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RenderedLeaseFile:
    storage_key: str
    filename: str
    content_type: str
    size_bytes: int
