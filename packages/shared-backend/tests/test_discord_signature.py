"""Unit tests for platform_shared.services.discord.signature.

All Ed25519 keypair operations are performed in-test (no external keys or
network calls). The clock is injected to freeze time without monkeypatching
``time.time``.

Test coverage:
  - Valid request accepted
  - Tampered body rejected
  - Wrong public key rejected
  - Stale timestamp (too old) rejected
  - Future timestamp (too far ahead) rejected
  - Malformed hex in signature header
  - Malformed hex in public key argument
  - Malformed / non-numeric timestamp
  - FastAPI dependency helper: valid request returns parsed JSON
  - FastAPI dependency helper: invalid signature raises HTTPException(401)
"""
import json
import logging
import time

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi import HTTPException
from starlette.testclient import TestClient
from starlette.requests import Request as StarletteRequest

from platform_shared.services.discord.signature import (
    TIMESTAMP_TOLERANCE_S,
    DiscordSignatureError,
    make_discord_dependency,
    verify_discord_request,
    verify_discord_signature,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_keypair() -> tuple[Ed25519PrivateKey, str]:
    """Return (private_key, public_key_hex) for a freshly generated Ed25519 key."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    pub_hex = public_key.public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
    return private_key, pub_hex


def _sign(private_key: Ed25519PrivateKey, timestamp: str, body: bytes) -> str:
    """Return hex-encoded Ed25519 signature for a (timestamp, body) pair."""
    message = timestamp.encode() + body
    return private_key.sign(message).hex()


def _frozen_clock(ts: float):
    """Return a zero-argument callable that always returns ``ts``."""
    def _clock() -> float:
        return ts
    return _clock


# ---------------------------------------------------------------------------
# verify_discord_signature — core function
# ---------------------------------------------------------------------------

class TestVerifyDiscordSignature:
    def test_valid_request_accepted(self) -> None:
        """A correctly signed request must not raise."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":1}'
        ts = str(int(time.time()))
        sig_hex = _sign(private_key, ts, body)

        # Should not raise
        verify_discord_signature(pub_hex, sig_hex, ts, body)

    def test_tampered_body_rejected(self) -> None:
        """Modifying any byte of the body must invalidate the signature."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":1}'
        ts = str(int(time.time()))
        sig_hex = _sign(private_key, ts, body)

        with pytest.raises(DiscordSignatureError, match="Signature verification failed"):
            verify_discord_signature(pub_hex, sig_hex, ts, body + b"X")

    def test_wrong_public_key_rejected(self) -> None:
        """A signature valid for key A must be rejected when verified with key B."""
        private_key_a, _ = _generate_keypair()
        _, pub_hex_b = _generate_keypair()
        body = b'{"type":2}'
        ts = str(int(time.time()))
        sig_hex = _sign(private_key_a, ts, body)

        with pytest.raises(DiscordSignatureError, match="Signature verification failed"):
            verify_discord_signature(pub_hex_b, sig_hex, ts, body)

    def test_stale_timestamp_rejected(self) -> None:
        """Timestamps older than TIMESTAMP_TOLERANCE_S must be rejected (replay protection)."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":1}'
        stale_ts_str = str(int(time.time()) - (TIMESTAMP_TOLERANCE_S + 1))
        sig_hex = _sign(private_key, stale_ts_str, body)

        with pytest.raises(DiscordSignatureError, match="out of tolerance"):
            verify_discord_signature(pub_hex, sig_hex, stale_ts_str, body)

    def test_future_timestamp_rejected(self) -> None:
        """Timestamps too far in the future must also be rejected."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":1}'
        future_ts_str = str(int(time.time()) + (TIMESTAMP_TOLERANCE_S + 1))
        sig_hex = _sign(private_key, future_ts_str, body)

        with pytest.raises(DiscordSignatureError, match="out of tolerance"):
            verify_discord_signature(pub_hex, sig_hex, future_ts_str, body)

    def test_timestamp_boundary_accepted(self) -> None:
        """A timestamp exactly at the tolerance boundary must be accepted."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":1}'
        now = 1_700_000_000.0
        ts_str = str(int(now) - TIMESTAMP_TOLERANCE_S)
        sig_hex = _sign(private_key, ts_str, body)

        # Should not raise (delta == TIMESTAMP_TOLERANCE_S exactly)
        verify_discord_signature(
            pub_hex, sig_hex, ts_str, body, clock=_frozen_clock(now)
        )

    def test_malformed_hex_in_signature(self) -> None:
        """Non-hex characters in X-Signature-Ed25519 must raise DiscordSignatureError."""
        _, pub_hex = _generate_keypair()
        ts = str(int(time.time()))

        with pytest.raises(DiscordSignatureError, match="Malformed hex"):
            verify_discord_signature(pub_hex, "NOT-VALID-HEX!!!", ts, b"body")

    def test_malformed_hex_in_public_key(self) -> None:
        """Non-hex characters in the public key argument must raise DiscordSignatureError."""
        private_key, _ = _generate_keypair()
        ts = str(int(time.time()))
        sig_hex = _sign(private_key, ts, b"body")

        with pytest.raises(DiscordSignatureError, match="Malformed hex"):
            verify_discord_signature("NOT-VALID-HEX!!!", sig_hex, ts, b"body")

    def test_malformed_timestamp_rejected(self) -> None:
        """A non-numeric timestamp must raise DiscordSignatureError."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":1}'
        sig_hex = _sign(private_key, "abc", body)

        with pytest.raises(DiscordSignatureError, match="Malformed timestamp"):
            verify_discord_signature(pub_hex, sig_hex, "abc", body)

    def test_clock_injection_works(self) -> None:
        """Injected clock is used for timestamp comparison, not wall time."""
        private_key, pub_hex = _generate_keypair()
        body = b'{"type":2}'
        frozen = 1_000_000_000.0
        ts_str = str(int(frozen))
        sig_hex = _sign(private_key, ts_str, body)

        # Far from real wall time; should pass because injected clock matches ts
        verify_discord_signature(
            pub_hex, sig_hex, ts_str, body, clock=_frozen_clock(frozen)
        )

    def test_body_not_logged_on_failure(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Sensitive body bytes must never appear in log output on failure."""
        _, pub_hex = _generate_keypair()
        secret_body = b'{"password":"hunter2"}'
        ts = str(int(time.time()))

        with caplog.at_level(logging.DEBUG):
            with pytest.raises(DiscordSignatureError):
                verify_discord_signature(pub_hex, "badhex", ts, secret_body)

        full_log = " ".join(r.getMessage() for r in caplog.records)
        assert b"hunter2" not in full_log.encode()
        assert "hunter2" not in full_log


# ---------------------------------------------------------------------------
# verify_discord_request — FastAPI dependency
# ---------------------------------------------------------------------------

class TestVerifyDiscordRequest:
    """Tests for the async ``verify_discord_request`` function via ASGI test app."""

    def _make_request(
        self,
        pub_hex: str,
        sig_hex: str,
        ts: str,
        body: bytes,
        *,
        clock=None,
    ):
        """Build a minimal ASGI app + TestClient that exercises ``verify_discord_request``."""
        from fastapi import FastAPI

        app = FastAPI()
        captured: dict = {}

        @app.post("/interactions")
        async def _handler(request: StarletteRequest):
            _clock = clock or time.time
            payload = await verify_discord_request(
                request, public_key_hex=pub_hex, clock=_clock
            )
            captured["payload"] = payload
            return {"ok": True}

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/interactions",
            content=body,
            headers={
                "X-Signature-Ed25519": sig_hex,
                "X-Signature-Timestamp": ts,
                "Content-Type": "application/json",
            },
        )
        return resp, captured

    def test_valid_request_returns_parsed_json(self) -> None:
        """A valid request must yield the parsed JSON to the handler."""
        private_key, pub_hex = _generate_keypair()
        body = json.dumps({"type": 1}).encode()
        ts = str(int(time.time()))
        sig_hex = _sign(private_key, ts, body)

        resp, captured = self._make_request(pub_hex, sig_hex, ts, body)

        assert resp.status_code == 200
        assert captured.get("payload") == {"type": 1}

    def test_invalid_signature_returns_401(self) -> None:
        """A tampered body must result in HTTP 401."""
        private_key, pub_hex = _generate_keypair()
        body = json.dumps({"type": 2}).encode()
        ts = str(int(time.time()))
        # Sign a different body intentionally
        sig_hex = _sign(private_key, ts, b"different")

        resp, _ = self._make_request(pub_hex, sig_hex, ts, body)

        assert resp.status_code == 401

    def test_missing_headers_return_401(self) -> None:
        """Absent signature headers must result in HTTP 401."""
        _, pub_hex = _generate_keypair()
        from fastapi import FastAPI
        app = FastAPI()

        @app.post("/interactions")
        async def _handler(request: StarletteRequest):
            return await verify_discord_request(request, public_key_hex=pub_hex)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/interactions",
            content=b'{"type":1}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# make_discord_dependency — factory
# ---------------------------------------------------------------------------

class TestMakeDiscordDependency:
    def test_dependency_factory_produces_working_verifier(self) -> None:
        """make_discord_dependency should return a dependency that accepts valid requests."""
        from fastapi import FastAPI, Depends
        from typing import Any

        private_key, pub_hex = _generate_keypair()
        verify_discord = make_discord_dependency(pub_hex)

        app = FastAPI()
        captured: dict = {}

        @app.post("/interactions")
        async def _handler(payload: Any = Depends(verify_discord)):
            captured["payload"] = payload
            return {"ok": True}

        body = json.dumps({"type": 1}).encode()
        ts = str(int(time.time()))
        sig_hex = _sign(private_key, ts, body)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/interactions",
            content=body,
            headers={
                "X-Signature-Ed25519": sig_hex,
                "X-Signature-Timestamp": ts,
                "Content-Type": "application/json",
            },
        )

        assert resp.status_code == 200
        assert captured.get("payload") == {"type": 1}

    def test_dependency_factory_rejects_invalid_signature(self) -> None:
        """make_discord_dependency should reject an invalid signature with 401."""
        from fastapi import FastAPI, Depends
        from typing import Any

        _, pub_hex = _generate_keypair()
        other_private_key, _ = _generate_keypair()
        verify_discord = make_discord_dependency(pub_hex)

        app = FastAPI()

        @app.post("/interactions")
        async def _handler(payload: Any = Depends(verify_discord)):
            return {"ok": True}

        body = json.dumps({"type": 2}).encode()
        ts = str(int(time.time()))
        sig_hex = _sign(other_private_key, ts, body)  # signed with wrong key

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/interactions",
            content=body,
            headers={
                "X-Signature-Ed25519": sig_hex,
                "X-Signature-Timestamp": ts,
                "Content-Type": "application/json",
            },
        )

        assert resp.status_code == 401
