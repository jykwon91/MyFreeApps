"""Chat tickets, the transcript digest and network hashing — pure units, no DB."""
from __future__ import annotations

import base64
import json

import pytest

from app.core.client_network import network_of
from app.core.wow_chat_limits import TICKET_TTL_SECONDS
from app.schemas.wow.chat.chat_message import ChatMessage
from app.services.wow.chat.chat_errors import ChatTicketExpiredError, ChatTicketInvalidError
from app.services.wow.chat.chat_keys import network_hash
from app.services.wow.chat.chat_ticket import issue_ticket, read_ticket, require_digest
from app.services.wow.chat.chat_transcript import conversation_digest

NOW = 1_800_000_000.0
NET = network_hash("198.51.100.4")
DIGEST = "a" * 64


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def test_round_trip() -> None:
    ticket = issue_ticket(network_hash=NET, rounds_left=2, digest=DIGEST, now=NOW)
    claims = read_ticket(ticket, network_hash=NET, now=NOW + 1)
    assert (claims.rounds_left, claims.digest, claims.expires_at) == (2, DIGEST, int(NOW) + TICKET_TTL_SECONDS)
    require_digest(claims, DIGEST)


@pytest.mark.parametrize("ticket", [None, "", 42])
def test_missing_ticket_is_required(ticket: object) -> None:
    with pytest.raises(ChatTicketInvalidError) as exc:
        read_ticket(ticket, network_hash=NET, now=NOW)
    assert exc.value.code == "chat_ticket_required"


@pytest.mark.parametrize("ticket", ["nodot", ".sig", "payload.", "é.é", "a.b.c"])
def test_malformed_ticket(ticket: str) -> None:
    with pytest.raises(ChatTicketInvalidError) as exc:
        read_ticket(ticket, network_hash=NET, now=NOW)
    assert exc.value.code == "chat_ticket_invalid"


def test_payload_edit_breaks_the_signature() -> None:
    payload, signature = issue_ticket(network_hash=NET, rounds_left=0, digest=DIGEST, now=NOW).split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    claims["rounds_left"] = 3
    forged = _b64(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode())
    with pytest.raises(ChatTicketInvalidError):
        read_ticket(f"{forged}.{signature}", network_hash=NET, now=NOW)


def test_expired() -> None:
    ticket = issue_ticket(network_hash=NET, rounds_left=1, digest=DIGEST, now=NOW)
    with pytest.raises(ChatTicketExpiredError) as exc:
        read_ticket(ticket, network_hash=NET, now=NOW + TICKET_TTL_SECONDS)
    assert exc.value.error_type == "expired"


def test_other_network_reads_as_expired() -> None:
    ticket = issue_ticket(network_hash=NET, rounds_left=1, digest=DIGEST, now=NOW)
    with pytest.raises(ChatTicketExpiredError) as exc:
        read_ticket(ticket, network_hash=network_hash("203.0.113.1"), now=NOW)
    assert exc.value.error_type == "network_mismatch"


def test_digest_mismatch() -> None:
    ticket = issue_ticket(network_hash=NET, rounds_left=1, digest=DIGEST, now=NOW)
    claims = read_ticket(ticket, network_hash=NET, now=NOW)
    with pytest.raises(ChatTicketInvalidError) as exc:
        require_digest(claims, "b" * 64)
    assert exc.value.error_type == "digest_mismatch"


def test_network_hash_groups_ipv6_by_64_but_not_ipv4() -> None:
    assert network_hash("2001:db8:1:2::1") == network_hash("2001:db8:1:2:abcd::9")
    assert network_hash("2001:db8:1:2::1") != network_hash("2001:db8:1:3::1")
    assert network_hash("198.51.100.4") != network_hash("198.51.100.5")
    assert network_of("2001:db8:1:2::1", ipv6_prefix=64) == "2001:db8:1:2::/64"
    assert network_of("not-an-ip", ipv6_prefix=64) == "not-an-ip"


def _tool_call(tool_input: dict[str, object]) -> ChatMessage:
    return ChatMessage.model_validate(
        {"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "search_npcs", "input": tool_input}]}
    )


def test_digest_ignores_key_order_and_integral_floats_but_not_message_order() -> None:
    question = ChatMessage.model_validate({"role": "user", "content": [{"type": "text", "text": "a"}]})
    call = _tool_call({"b": 1.0, "a": "x"})
    same_call = _tool_call({"a": "x", "b": 1})
    assert conversation_digest([question, call]) == conversation_digest([question, same_call])
    assert conversation_digest([question, call]) != conversation_digest([call, question])
    assert conversation_digest([question, call]) != conversation_digest([question, _tool_call({"a": "y", "b": 1})])
