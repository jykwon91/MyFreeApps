"""Whether the organization's Gmail can send rent receipts right now."""
from __future__ import annotations

from typing import Literal

ReceiptGmailState = Literal["ready", "not_connected", "needs_send_permission", "needs_reconnect"]
