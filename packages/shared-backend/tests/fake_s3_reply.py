"""The one reply a ``fake_s3_server`` gives every request, and what it saw."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FakeS3Reply:
    status: int
    body: bytes = b""
    content_type: str = "application/xml"
    headers: dict[str, str] = field(default_factory=dict)
    requests: list[str] = field(default_factory=list)
