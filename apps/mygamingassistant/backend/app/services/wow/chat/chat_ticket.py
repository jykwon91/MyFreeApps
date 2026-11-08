"""Signed chat tickets — the only state the relay keeps, and it lives in the browser.

A ticket is ``base64url(payload JSON) "." base64url(HMAC-SHA256(payload))``,
payload ``{v, iph, exp, rounds_left, digest}``. It proves the conversation the
browser sends back is the one this server answered (``digest``), from the same
network (``iph``), recently (``exp``), with tool rounds left. The signature is
checked (constant time) before the payload is even decoded.

Expired, and issued-to-another-network, both read as "expired" to the browser
(start a new chat); the log line says which.
"""
import base64
import binascii
import hashlib
import hmac
import json
import logging
import time

from app.core.wow_chat_limits import (
    DETAIL_TICKET_EXPIRED,
    DETAIL_TICKET_INVALID,
    DETAIL_TICKET_REQUIRED,
    TICKET_TTL_SECONDS,
    TICKET_VERSION,
)
from app.services.wow.chat.chat_errors import ChatTicketExpiredError, ChatTicketInvalidError
from app.services.wow.chat.chat_keys import ticket_key
from app.services.wow.chat.ticket_claims import TicketClaims

logger = logging.getLogger(__name__)

_SEPARATOR = "."


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload_part: str) -> str:
    return _b64encode(hmac.new(ticket_key(), payload_part.encode("ascii"), hashlib.sha256).digest())


def issue_ticket(*, network_hash: str, rounds_left: int, digest: str, now: float | None = None) -> str:
    payload = {
        "v": TICKET_VERSION,
        "iph": network_hash,
        "exp": int(now if now is not None else time.time()) + TICKET_TTL_SECONDS,
        "rounds_left": rounds_left,
        "digest": digest,
    }
    payload_part = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{payload_part}{_SEPARATOR}{_sign(payload_part)}"


def _invalid(reason: str) -> ChatTicketInvalidError:
    logger.info("wow chat: ticket rejected reason=%s", reason)
    return ChatTicketInvalidError(DETAIL_TICKET_INVALID, error_type=reason)


def _decode_payload(payload_part: str) -> dict[str, object]:
    try:
        payload = json.loads(_b64decode(payload_part))
    except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
        raise _invalid("undecodable") from exc
    if not isinstance(payload, dict):
        raise _invalid("not_an_object")
    return payload


def _claims_from(payload: dict[str, object]) -> TicketClaims:
    iph, exp, rounds_left, digest = (payload.get(k) for k in ("iph", "exp", "rounds_left", "digest"))
    if payload.get("v") != TICKET_VERSION:
        raise _invalid("version")
    if not (
        isinstance(iph, str)
        and isinstance(digest, str)
        and isinstance(exp, int)
        and isinstance(rounds_left, int)
        and not isinstance(exp, bool)
        and not isinstance(rounds_left, bool)
    ):
        raise _invalid("fields")
    return TicketClaims(network_hash=iph, expires_at=exp, rounds_left=rounds_left, digest=digest)


def read_ticket(ticket: object, *, network_hash: str, now: float | None = None) -> TicketClaims:
    """Verify signature, version, expiry and network; the digest is the caller's to compare."""
    if not isinstance(ticket, str) or not ticket:
        raise ChatTicketInvalidError(DETAIL_TICKET_REQUIRED, error_type="missing")
    payload_part, separator, signature = ticket.partition(_SEPARATOR)
    if not separator or not payload_part or not signature:
        raise _invalid("malformed")
    try:
        expected = _sign(payload_part)
    except UnicodeEncodeError as exc:
        raise _invalid("malformed") from exc
    if not hmac.compare_digest(expected.encode("ascii"), signature.encode("utf-8")):
        raise _invalid("bad_signature")
    claims = _claims_from(_decode_payload(payload_part))
    if claims.expires_at <= int(now if now is not None else time.time()):
        logger.info("wow chat: ticket rejected reason=expired")
        raise ChatTicketExpiredError(DETAIL_TICKET_EXPIRED, error_type="expired")
    if not hmac.compare_digest(claims.network_hash.encode("utf-8"), network_hash.encode("utf-8")):
        logger.info("wow chat: ticket rejected reason=network_mismatch")
        raise ChatTicketExpiredError(DETAIL_TICKET_EXPIRED, error_type="network_mismatch")
    return claims


def require_digest(claims: TicketClaims, digest: str) -> None:
    if not hmac.compare_digest(claims.digest.encode("utf-8"), digest.encode("utf-8")):
        raise _invalid("digest_mismatch")
