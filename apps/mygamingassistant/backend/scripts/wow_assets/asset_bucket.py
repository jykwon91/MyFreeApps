"""What a publish script needs from a bucket — the real one or a test fake."""
from __future__ import annotations

from typing import Protocol


class AssetBucket(Protocol):
    def exists(self, key: str) -> bool: ...

    def put(self, key: str, body: bytes) -> None: ...
