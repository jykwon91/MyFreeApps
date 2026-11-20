"""The order-ready SMS, composed and waiting to be sent."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ReadyText:
    """What to text the customer, or why they can't be texted.

    ``skip_reason`` is set when the message can't be sent at all (no phone
    on file, missing slot or customer); ``phone`` and ``body`` are then empty.
    """

    phone: str = ""
    body: str = ""
    skip_reason: Optional[str] = None
