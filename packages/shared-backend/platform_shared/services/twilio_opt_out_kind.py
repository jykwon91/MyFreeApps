"""Which opt-out keyword an incoming text was: stop texts, start them again, or ask for help."""
from __future__ import annotations

from typing import Literal

TwilioOptOutKind = Literal["stop", "start", "help"]
