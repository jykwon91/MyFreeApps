"""Discord HTTP interaction signature verification.

Verifies the Ed25519 signature on incoming webhook requests per
https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization.

Required headers on each incoming request:
  X-Signature-Ed25519:   hex-encoded Ed25519 signature over (timestamp + raw body)
  X-Signature-Timestamp: Unix timestamp string (seconds, decimal)

Replay protection rejects requests whose timestamp differs from the server
clock by more than TIMESTAMP_TOLERANCE_S (300 s). Inject ``clock`` in tests to
freeze time without monkeypatching builtins.
"""
import logging
import time
from collections.abc import Callable, Awaitable
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

TIMESTAMP_TOLERANCE_S: int = 300  # seconds; Discord's own recommendation


class DiscordSignatureError(Exception):
    """Raised when Ed25519 signature verification fails for any reason.

    The message describes why (bad hex, wrong key, stale timestamp) for
    logging — never forward it verbatim to the client.
    """


def verify_discord_signature(
    public_key_hex: str,
    signature_hex: str,
    timestamp: str,
    body: bytes,
    *,
    clock: Callable[[], float] = time.time,
) -> None:
    """Verify an Ed25519-signed Discord interaction request.

    Raises :exc:`DiscordSignatureError` on any failure:
      - Malformed hex in ``signature_hex`` or ``public_key_hex``
      - Malformed or out-of-range ``timestamp``
      - Timestamp outside ±TIMESTAMP_TOLERANCE_S of current wall clock
      - Cryptographic signature mismatch

    On success returns ``None``. Never logs the request body.

    Args:
        public_key_hex: Application public key from the Discord Developer Portal (hex).
        signature_hex:  Value of the ``X-Signature-Ed25519`` header (hex).
        timestamp:      Value of the ``X-Signature-Timestamp`` header (decimal seconds).
        body:           Raw request body bytes — the message includes these verbatim.
        clock:          Callable returning current Unix time; injectable for tests.
    """
    # --- timestamp bounds check (replay protection) ---
    try:
        ts = float(timestamp)
        now = clock()
    except (ValueError, TypeError) as exc:
        raise DiscordSignatureError(f"Malformed timestamp: {timestamp!r}") from exc

    delta = abs(now - ts)
    if delta > TIMESTAMP_TOLERANCE_S:
        raise DiscordSignatureError(
            f"Timestamp out of tolerance: delta={delta:.0f}s limit={TIMESTAMP_TOLERANCE_S}s"
        )

    # --- hex decoding ---
    try:
        sig_bytes = bytes.fromhex(signature_hex)
    except ValueError as exc:
        raise DiscordSignatureError("Malformed hex in X-Signature-Ed25519") from exc

    try:
        key_bytes = bytes.fromhex(public_key_hex)
    except ValueError as exc:
        raise DiscordSignatureError("Malformed hex in application public key") from exc

    # --- cryptographic verification ---
    try:
        public_key = Ed25519PublicKey.from_public_bytes(key_bytes)
        message = timestamp.encode() + body
        public_key.verify(sig_bytes, message)
    except (InvalidSignature, ValueError) as exc:
        raise DiscordSignatureError("Signature verification failed") from exc


async def verify_discord_request(
    request: Request,
    *,
    public_key_hex: str,
    clock: Callable[[], float] = time.time,
) -> Any:
    """Verify a Discord interaction request and return the parsed JSON payload.

    Reads the raw body once (cached by Starlette after the first read), verifies
    the Ed25519 signature, and raises ``HTTPException(401)`` on failure.  On
    success returns ``await request.json()`` so the caller never has to re-parse.

    Intended for use as a FastAPI dependency via :func:`make_discord_dependency`.

    Args:
        request:        The incoming FastAPI/Starlette ``Request``.
        public_key_hex: Application public key (hex) from the Discord Developer Portal.
        clock:          Callable returning current Unix time; injectable for tests.

    Returns:
        Parsed JSON payload (``dict`` or ``list``).

    Raises:
        HTTPException: 401 when signature is invalid or missing.
    """
    signature = request.headers.get("X-Signature-Ed25519", "")
    timestamp = request.headers.get("X-Signature-Timestamp", "")
    body = await request.body()  # Starlette caches; safe to call json() afterwards

    try:
        verify_discord_signature(
            public_key_hex,
            signature,
            timestamp,
            body,
            clock=clock,
        )
    except DiscordSignatureError as exc:
        logger.warning("Discord signature rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid request signature") from exc

    return await request.json()


def make_discord_dependency(
    public_key_hex: str,
    *,
    clock: Callable[[], float] = time.time,
) -> Callable[[Request], Awaitable[Any]]:
    """Return an async FastAPI dependency that verifies Discord interaction requests.

    Usage::

        from fastapi import APIRouter, Depends
        from platform_shared.services.discord.signature import make_discord_dependency

        verify_discord = make_discord_dependency(settings.discord_public_key)

        router = APIRouter()

        @router.post("/interactions")
        async def interactions(payload: Any = Depends(verify_discord)):
            interaction_type = payload["type"]
            ...

    The dependency reads the raw body, verifies the Ed25519 signature, and
    returns the parsed JSON.  HTTPException(401) is raised on any failure so
    FastAPI handles the error response automatically.

    Args:
        public_key_hex: Application public key (hex) from the Discord Developer Portal.
        clock:          Callable returning current Unix time; injectable for tests.
    """
    async def _verify(request: Request) -> Any:
        return await verify_discord_request(
            request,
            public_key_hex=public_key_hex,
            clock=clock,
        )

    return _verify
