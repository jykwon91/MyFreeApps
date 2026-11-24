"""A Sentry log as the SDK sends it."""

from __future__ import annotations

from typing import TypedDict


class SentLog(TypedDict):
    """The parts of a sent log the tests read.

    Each attribute goes over the wire as ``{"value": ..., "type": ...}``.
    """

    body: str
    attributes: dict[str, dict[str, object]]
