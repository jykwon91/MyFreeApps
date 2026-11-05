"""Why a queued rent receipt can't be sent yet, or ``None`` when it can."""
from __future__ import annotations

from typing import Literal

ReceiptSendBlocker = Literal[
    "not_attributed", "tenant_of_other_member", "tenant_no_email", "no_lease",
]
