"""Minimal email signal payload passed into BounceDetector.

Decouples the detector from the Gmail API shape — anything that can produce
these four fields can drive the detector (production code, tests, future
non-Gmail providers).
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class InboundEmailSignals:
    from_address: str | None
    subject: str | None
    headers: dict[str, str]
    body_preview: str | None
