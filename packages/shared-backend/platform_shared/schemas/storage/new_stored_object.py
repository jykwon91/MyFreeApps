"""An object about to be uploaded, under a key chosen before the upload."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NewStoredObject:
    key: str
    content: bytes
    content_type: str
