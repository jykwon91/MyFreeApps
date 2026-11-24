"""Plaid webhook signature verification with a freshly generated P-256 key
standing in for Plaid's published one.

Pinned here: a correctly signed, fresh webhook passes; a missing header, a
non-ES256 (or ``none``) header, a header naming no key, a rotated-out key, a
signature from another key, a stale ``iat`` and a body that doesn't match its
hash are each refused; and the key is fetched once then cached.
"""
from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

from app.schemas.plaid.wire.plaid_wire_verification_key import PlaidWireVerificationKey
from app.services.plaid import plaid_webhook_verifier as verifier
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_webhook_verification_error import PlaidWebhookVerificationError

pytestmark = pytest.mark.asyncio

_KID = "kid-1"
_BODY = b'{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-1"}'
_FETCH = "app.services.plaid.plaid_webhook_verifier.plaid_client.get_webhook_verification_key"


def _public_jwk(private_key: ec.EllipticCurvePrivateKey, **extra: Any) -> PlaidWireVerificationKey:
    jwk = json.loads(ECAlgorithm.to_jwk(private_key.public_key()))
    return PlaidWireVerificationKey(**jwk, kid=_KID, alg="ES256", use="sig", **extra)


def _sign(
    private_key: ec.EllipticCurvePrivateKey,
    *,
    body: bytes = _BODY,
    iat: float | None = None,
    algorithm: str = "ES256",
    kid: str | None = _KID,
) -> str:
    claims = {
        "iat": int(time.time() if iat is None else iat),
        "request_body_sha256": hashlib.sha256(body).hexdigest(),
    }
    headers = {"kid": kid} if kid is not None else {}
    return jwt.encode(claims, private_key, algorithm=algorithm, headers=headers)


@pytest.fixture()
def key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(autouse=True)
def _empty_cache() -> Iterator[None]:
    verifier.clear_key_cache()
    yield
    verifier.clear_key_cache()


async def test_a_fresh_correctly_signed_webhook_passes(key: ec.EllipticCurvePrivateKey) -> None:
    fetch = AsyncMock(return_value=_public_jwk(key))
    with patch(_FETCH, fetch):
        await verifier.verify(_BODY, _sign(key))
        await verifier.verify(_BODY, _sign(key))
    fetch.assert_awaited_once_with(_KID)


async def test_a_missing_header_is_refused() -> None:
    with pytest.raises(PlaidWebhookVerificationError, match="missing"):
        await verifier.verify(_BODY, None)


async def test_garbage_in_the_header_is_refused() -> None:
    with pytest.raises(PlaidWebhookVerificationError, match="malformed"):
        await verifier.verify(_BODY, "not-a-jwt")


async def test_an_hs256_token_is_refused_before_any_key_is_fetched() -> None:
    forged = jwt.encode({"iat": int(time.time())}, "guessable", algorithm="HS256", headers={"kid": _KID})
    fetch = AsyncMock()
    with patch(_FETCH, fetch), pytest.raises(PlaidWebhookVerificationError, match="algorithm"):
        await verifier.verify(_BODY, forged)
    fetch.assert_not_awaited()


async def test_an_unsigned_none_token_is_refused() -> None:
    forged = jwt.encode({"iat": int(time.time())}, None, algorithm="none", headers={"kid": _KID})
    with pytest.raises(PlaidWebhookVerificationError, match="algorithm"):
        await verifier.verify(_BODY, forged)


async def test_a_token_naming_no_key_is_refused(key: ec.EllipticCurvePrivateKey) -> None:
    with pytest.raises(PlaidWebhookVerificationError, match="no key"):
        await verifier.verify(_BODY, _sign(key, kid=None))


async def test_a_rotated_out_key_is_refused(key: ec.EllipticCurvePrivateKey) -> None:
    with (
        patch(_FETCH, AsyncMock(return_value=_public_jwk(key, expired_at=int(time.time()) - 60))),
        pytest.raises(PlaidWebhookVerificationError, match="rotated"),
    ):
        await verifier.verify(_BODY, _sign(key))


async def test_a_signature_from_another_key_is_refused(key: ec.EllipticCurvePrivateKey) -> None:
    impostor = ec.generate_private_key(ec.SECP256R1())
    with (
        patch(_FETCH, AsyncMock(return_value=_public_jwk(key))),
        pytest.raises(PlaidWebhookVerificationError, match="signature"),
    ):
        await verifier.verify(_BODY, _sign(impostor))


async def test_a_replayed_old_webhook_is_refused(key: ec.EllipticCurvePrivateKey) -> None:
    with (
        patch(_FETCH, AsyncMock(return_value=_public_jwk(key))),
        pytest.raises(PlaidWebhookVerificationError, match="too old"),
    ):
        await verifier.verify(_BODY, _sign(key, iat=time.time() - 301))


async def test_a_body_that_does_not_match_its_hash_is_refused(key: ec.EllipticCurvePrivateKey) -> None:
    tampered = _BODY.replace(b"item-1", b"item-2")
    with (
        patch(_FETCH, AsyncMock(return_value=_public_jwk(key))),
        pytest.raises(PlaidWebhookVerificationError, match="body"),
    ):
        await verifier.verify(tampered, _sign(key))


async def test_plaid_refusing_the_key_lookup_refuses_the_webhook(key: ec.EllipticCurvePrivateKey) -> None:
    refusal = PlaidApiError(
        endpoint="/webhook_verification_key/get", status_code=400,
        error_type="INVALID_INPUT", error_code="INVALID_KEY_ID", request_id="r",
    )
    with patch(_FETCH, AsyncMock(side_effect=refusal)), pytest.raises(PlaidWebhookVerificationError, match="INVALID_KEY_ID"):
        await verifier.verify(_BODY, _sign(key))
