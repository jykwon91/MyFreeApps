"""One-way keys for anonymous feature-request votes and submissions.

Never store a raw IP or the browser's client UUID. Every value here is an
HMAC-SHA256 under a key derived from SECRET_KEY with a domain label, so the
hashes are useless outside this feature and change if SECRET_KEY rotates.

- ``voter_key``: HMAC of the client UUID only, so the per-story uniqueness
  still dedupes when triage merges two stories (a voter on both keeps one).
- ``vote_ip_hash``: HMAC of story id + network, so networks can't be linked
  across stories; only caps votes per network per story.
- ``submission_ip_hash``: HMAC of the network, for triage to spot one source
  of spam. Both IP hashes are NULLed after 30 days.

IPv6 addresses are cut to their /64 network (one home or phone).
"""
import hashlib
import hmac
import uuid

from app.core.client_network import network_of
from app.core.config import settings
from app.core.wow_feature_request_limits import IPV6_VOTE_PREFIX

_KEY_LABEL = b"mga:wow-feature-requests:hmac-key:v1"


def _key() -> bytes:
    return hmac.new(settings.secret_key.encode("utf-8"), _KEY_LABEL, hashlib.sha256).digest()


def _hmac(message: str) -> str:
    return hmac.new(_key(), message.encode("utf-8"), hashlib.sha256).hexdigest()


def voter_key(client_id: uuid.UUID) -> str:
    return _hmac(f"vote:v1:{client_id}")


def vote_ip_hash(story_id: uuid.UUID, ip: str) -> str:
    return _hmac(f"vote-ip:v1:{story_id}:{network_of(ip, ipv6_prefix=IPV6_VOTE_PREFIX)}")


def submission_ip_hash(ip: str) -> str:
    return _hmac(f"submission-ip:v1:{network_of(ip, ipv6_prefix=IPV6_VOTE_PREFIX)}")
