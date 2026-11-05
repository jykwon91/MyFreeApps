"""The website and phone read ``send_blocker`` and ``gmail_state`` by value.

A value added or renamed here without the api-client's types and messages
would show nothing, or the wrong reason, next to a disabled Send.
"""
import re
from pathlib import Path
from typing import get_args

from app.schemas.leases.receipt_gmail_state import ReceiptGmailState
from app.schemas.leases.receipt_send_blocker import ReceiptSendBlocker

API_CLIENT = Path(__file__).parents[2] / "api-client" / "src"
MESSAGES = (API_CLIENT / "constants" / "receiptReadinessMessages.ts").read_text()


def _union(type_file: str) -> set[str]:
    return set(re.findall(r'"(\w+)"', (API_CLIENT / "types" / "lease" / type_file).read_text()))


def _message_keys(constant: str) -> set[str]:
    block = MESSAGES.split(constant)[1].split("};")[0]
    return set(re.findall(r"^\s+(\w+):", block, re.MULTILINE))


def test_send_blockers_match() -> None:
    blockers = set(get_args(ReceiptSendBlocker))
    assert len(blockers) == 4
    assert _union("receipt-send-blocker.ts") == blockers
    assert _message_keys("RECEIPT_SEND_BLOCKER_MESSAGES") == blockers


def test_gmail_states_match() -> None:
    states = set(get_args(ReceiptGmailState))
    assert len(states) == 4
    assert _union("receipt-gmail-state.ts") == states
    assert _message_keys("RECEIPT_GMAIL_STATE_MESSAGES") == states - {"ready"}
