"""``/webhook_verification_key/get`` ``key`` — a JWK (ES256).

``expired_at`` is set once Plaid has rotated the key out; a webhook signed by
an expired key is refused.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PlaidWireVerificationKey(BaseModel):
    kty: str
    crv: str | None = None
    x: str | None = None
    y: str | None = None
    kid: str
    alg: str | None = None
    use: str | None = None
    created_at: int | None = None
    expired_at: int | None = None

    model_config = ConfigDict(extra="ignore")
