"""Keys for the chat relay, derived from SECRET_KEY with HKDF and a dedicated label each.

- the ticket signing key (HMAC-SHA256 over the ticket payload);
- the network-hash key: the client's network (IPv4, or IPv6 /64) is only ever
  kept as an HMAC — in the ticket and in the per-network daily bucket name.

Both are useless outside this feature and change when SECRET_KEY rotates
(open chats then just start over).
"""
import hashlib
import hmac

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.client_network import network_of
from app.core.config import settings
from app.core.wow_chat_limits import IPV6_NETWORK_PREFIX

_TICKET_KEY_LABEL = b"mga:wow-chat:ticket-key:v1"
_NETWORK_KEY_LABEL = b"mga:wow-chat:network-hash-key:v1"
_KEY_BYTES = 32


def _derive(label: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=_KEY_BYTES, salt=None, info=label).derive(
        settings.secret_key.encode("utf-8")
    )


def ticket_key() -> bytes:
    return _derive(_TICKET_KEY_LABEL)


def network_hash(ip: str) -> str:
    network = network_of(ip, ipv6_prefix=IPV6_NETWORK_PREFIX)
    return hmac.new(_derive(_NETWORK_KEY_LABEL), network.encode("utf-8"), hashlib.sha256).hexdigest()
