"""Prove a webhook came from Plaid
(https://plaid.com/docs/api/webhooks/webhook-verification/).

The ``Plaid-Verification`` header is a JWT signed ES256 by a key Plaid
publishes by id. It is verified on every call — there is no "skip when
unconfigured" path: an unverifiable webhook is refused. Checked:

* the header names ES256 (anything else, including ``none``, is refused);
* the signing key is Plaid's and has not been rotated out (``expired_at``);
* the signature;
* ``iat`` is present and no more than five minutes old (replay window);
* ``request_body_sha256`` matches the body, compared in constant time.

Keys are cached by id for a day; an unknown id is fetched.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time

import jwt
from jwt.algorithms import ECAlgorithm

from app.core.plaid_constants import (
    PLAID_VERIFICATION_KEY_CACHE_SECONDS,
    PLAID_WEBHOOK_JWT_ALGORITHM,
    PLAID_WEBHOOK_MAX_AGE_SECONDS,
)
from app.schemas.plaid.wire.plaid_wire_verification_key import PlaidWireVerificationKey
from app.services.plaid import plaid_client
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_webhook_verification_error import PlaidWebhookVerificationError

# kid -> (fetched at, key)
_key_cache: dict[str, tuple[float, PlaidWireVerificationKey]] = {}


def clear_key_cache() -> None:
    _key_cache.clear()


async def _verification_key(key_id: str) -> PlaidWireVerificationKey:
    cached = _key_cache.get(key_id)
    if cached is not None and time.time() - cached[0] < PLAID_VERIFICATION_KEY_CACHE_SECONDS:
        return cached[1]
    try:
        key = await plaid_client.get_webhook_verification_key(key_id)
    except PlaidApiError as exc:
        raise PlaidWebhookVerificationError(
            f"verification key unavailable: {exc.error_code}",
        ) from exc
    _key_cache[key_id] = (time.time(), key)
    return key


async def verify(body: bytes, verification_header: str | None) -> None:
    """Return when the webhook is Plaid's; raise ``PlaidWebhookVerificationError``
    otherwise."""
    if not verification_header:
        raise PlaidWebhookVerificationError("missing Plaid-Verification header")
    try:
        header = jwt.get_unverified_header(verification_header)
    except jwt.PyJWTError as exc:
        raise PlaidWebhookVerificationError("malformed verification JWT") from exc
    if header.get("alg") != PLAID_WEBHOOK_JWT_ALGORITHM:
        raise PlaidWebhookVerificationError("unexpected signing algorithm")
    key_id = header.get("kid")
    if not isinstance(key_id, str) or not key_id:
        raise PlaidWebhookVerificationError("verification JWT names no key")

    key = await _verification_key(key_id)
    if key.expired_at is not None:
        raise PlaidWebhookVerificationError("signing key has been rotated out")
    try:
        public_key = ECAlgorithm.from_jwk(json.dumps(key.model_dump(exclude_none=True)))
        claims = jwt.decode(
            verification_header,
            public_key,  # type: ignore[arg-type]
            algorithms=[PLAID_WEBHOOK_JWT_ALGORITHM],
            options={"require": ["iat"], "verify_aud": False},
        )
    except (jwt.PyJWTError, ValueError) as exc:
        raise PlaidWebhookVerificationError("signature check failed") from exc

    issued_at = claims.get("iat")
    if not isinstance(issued_at, int | float) or time.time() - issued_at > PLAID_WEBHOOK_MAX_AGE_SECONDS:
        raise PlaidWebhookVerificationError("webhook is too old")
    claimed_hash = claims.get("request_body_sha256")
    if not isinstance(claimed_hash, str) or not hmac.compare_digest(
        claimed_hash, hashlib.sha256(body).hexdigest(),
    ):
        raise PlaidWebhookVerificationError("body does not match its signature")
