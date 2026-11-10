"""The website and phone recognise the server's refusals by the codes and words it uses.

The lock itself is decided once, on the server (``documents_locked`` and
``is_locked`` in the lease response); the clients only read it. What they do
repeat is the codes they branch on and the copy they show, which must not drift.
"""
import re
from pathlib import Path

from app.core.lease_render_constants import (
    LEASE_ATTACHMENT_LOCKED_CODE,
    LEASE_ATTACHMENT_LOCKED_MESSAGE,
    LEASE_DOCUMENTS_LOCKED_CODE,
    LEASE_DOCUMENTS_LOCKED_MESSAGE,
    LEASE_VALUE_LOCKED_CODE,
    LEASE_VALUE_LOCKED_MESSAGE,
)

API_CLIENT = Path(__file__).parents[2] / "api-client" / "src"


def _string(constant: str) -> str:
    source = (API_CLIENT / "constants" / "leaseDocumentsLocked.ts").read_text()
    literal = source.split(f"export const {constant} =")[1].split(";")[0]
    return "".join(re.findall(r'"([^"]*)"', literal))


def test_codes_are_upper_case_like_the_other_routers() -> None:
    for code in (LEASE_DOCUMENTS_LOCKED_CODE, LEASE_ATTACHMENT_LOCKED_CODE, LEASE_VALUE_LOCKED_CODE):
        assert code == code.upper()


def test_codes_and_messages_match() -> None:
    assert _string("LEASE_DOCUMENTS_LOCKED_CODE") == LEASE_DOCUMENTS_LOCKED_CODE
    assert _string("LEASE_ATTACHMENT_LOCKED_CODE") == LEASE_ATTACHMENT_LOCKED_CODE
    assert _string("LEASE_VALUE_LOCKED_CODE") == LEASE_VALUE_LOCKED_CODE
    assert _string("LEASE_DOCUMENTS_LOCKED_MESSAGE") == LEASE_DOCUMENTS_LOCKED_MESSAGE
    assert _string("LEASE_ATTACHMENT_LOCKED_MESSAGE") == LEASE_ATTACHMENT_LOCKED_MESSAGE
    assert _string("LEASE_VALUE_LOCKED_MESSAGE") == LEASE_VALUE_LOCKED_MESSAGE
