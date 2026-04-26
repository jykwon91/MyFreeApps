"""Plaid webhook signature verification using JWKS.

Verifies the Plaid-Verification JWT header against Plaid's public keys,
then checks the SHA-256 hash of the request body matches the JWT claim.
"""
import hashlib
import logging
import time
from typing import Any  # JWKS keys from Plaid API are untyped external JSON with no stable schema

import httpx
import jwt
from jwt import PyJWK
from jwt.exceptions import PyJWTError as JWTError

from app.core.config import settings

logger = logging.getLogger(__name__)

_ENVIRONMENT_URLS: dict[str, str] = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}

_MAX_AGE_SECONDS = 300  # 5 minutes — reject stale webhooks
_KEY_CACHE_TTL_SECONDS = 86400  # 24 hours

_key_cache: dict[str, tuple[dict[str, Any], float]] = {}


def _get_plaid_base_url() -> str:
    return _ENVIRONMENT_URLS.get(
        settings.plaid_environment, _ENVIRONMENT_URLS["sandbox"]
    )


async def _fetch_verification_key(kid: str) -> dict[str, Any] | None:
    """Fetch a JWKS verification key from Plaid by key ID."""
    now = time.time()
    if kid in _key_cache:
        cached_key, cached_at = _key_cache[kid]
        if now - cached_at < _KEY_CACHE_TTL_SECONDS:
            return cached_key

    base_url = _get_plaid_base_url()
    url = f"{base_url}/webhook_verification_key/get"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                json={
                    "client_id": settings.plaid_client_id,
                    "secret": settings.plaid_secret,
                    "key_id": kid,
                },
            )
            response.raise_for_status()
            data = response.json()
            key = data.get("key")
            if key:
                _key_cache[kid] = (key, now)
            return key
    except httpx.HTTPError:
        logger.warning("Failed to fetch Plaid verification key kid=%s", kid)
        return None


async def verify_plaid_webhook(
    verification_header: str | None, raw_body: bytes
) -> bool:
    """Verify a Plaid webhook signature.

    Returns True if verification passes or if Plaid is not configured
    (dev/test environments without Plaid credentials).
    """
    if not settings.plaid_client_id or not settings.plaid_secret:
        logger.debug("Plaid not configured — skipping webhook verification")
        return True

    if not verification_header:
        logger.warning("Missing Plaid-Verification header")
        return False

    try:
        unverified_header = jwt.get_unverified_header(verification_header)
    except JWTError:
        logger.warning("Invalid Plaid-Verification JWT header")
        return False

    kid = unverified_header.get("kid")
    if not kid:
        logger.warning("Plaid-Verification JWT missing kid")
        return False

    key = await _fetch_verification_key(kid)
    if not key:
        logger.warning("Could not fetch Plaid verification key kid=%s", kid)
        return False

    try:
        claims = jwt.decode(
            verification_header,
            PyJWK(key).key,
            algorithms=["ES256"],
            options={"verify_aud": False, "verify_sub": False},
        )
    except JWTError as e:
        logger.warning("Plaid webhook JWT verification failed: %s", e)
        return False

    iat = claims.get("iat")
    if iat and (time.time() - iat) > _MAX_AGE_SECONDS:
        logger.warning("Plaid webhook too old: iat=%s", iat)
        return False

    expected_hash = claims.get("request_body_sha256")
    if not expected_hash:
        logger.warning("Plaid webhook JWT missing request_body_sha256")
        return False

    actual_hash = hashlib.sha256(raw_body).hexdigest()
    if actual_hash != expected_hash:
        logger.warning("Plaid webhook body hash mismatch")
        return False

    return True
