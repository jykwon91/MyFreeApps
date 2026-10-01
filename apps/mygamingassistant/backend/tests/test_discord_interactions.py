"""POST /discord/interactions — Ed25519 verification, PING/PONG, command dispatch.

Architecture
------------
The Discord interactions endpoint is only mounted when ``discord_enabled=True``
(see app/main.py _mount_public_routes).  Tests use a ``discord_client`` fixture
that monkeypatches the global settings and calls ``create_app()`` so the router
is included for the duration of the test.

Signature verification
-----------------------
Tests use a real Ed25519 keypair generated once at module load.  The
``_discord_headers`` helper signs each request body so verification passes.
Tests for the bad-signature case send an empty/wrong signature.

No DB
-----
The Discord router makes no database calls in this PR — all handlers are
in-memory.  The ``discord_client`` fixture does not need a ``db`` fixture.
"""
from __future__ import annotations

import json
import time
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from httpx import ASGITransport, AsyncClient

from app.core.config import settings

# ---------------------------------------------------------------------------
# Test Ed25519 keypair (generated once at module import, never hits the network)
# ---------------------------------------------------------------------------

_PRIVATE_KEY = Ed25519PrivateKey.generate()
_PUBLIC_KEY_HEX: str = _PRIVATE_KEY.public_key().public_bytes(
    encoding=Encoding.Raw,
    format=PublicFormat.Raw,
).hex()


def _sign_body(body: bytes, timestamp: str) -> str:
    """Return the hex Ed25519 signature over (timestamp_bytes + body)."""
    message = timestamp.encode() + body
    sig_bytes = _PRIVATE_KEY.sign(message)
    return sig_bytes.hex()


def _discord_headers(body: bytes) -> dict[str, str]:
    """Build the X-Signature-* headers for a valid Discord request."""
    ts = str(int(time.time()))
    return {
        "X-Signature-Ed25519": _sign_body(body, ts),
        "X-Signature-Timestamp": ts,
        "Content-Type": "application/json",
    }


def _discord_payload(**fields: Any) -> bytes:
    """Serialize an interaction payload to bytes."""
    return json.dumps(fields).encode()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def discord_client(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient against a freshly-built app with Discord enabled + test key.

    Monkeypatches the global ``settings`` so ``verify_discord`` reads the test
    public key at request time, and so ``create_app()`` sees
    ``discord_enabled=True`` and mounts the router.
    """
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_public_key", _PUBLIC_KEY_HEX)
    monkeypatch.setattr(settings, "discord_application_id", "1234567890")
    monkeypatch.setattr(settings, "discord_bot_token", "test-bot-token")

    from app.main import create_app

    discord_app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=discord_app),
        base_url="http://test",
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# PING → PONG
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ping_returns_pong(discord_client: AsyncClient) -> None:
    """Discord's endpoint-verification PING must be answered with type=1 (PONG)."""
    body = _discord_payload(type=1)
    resp = await discord_client.post(
        "/discord/interactions",
        content=body,
        headers=_discord_headers(body),
    )
    assert resp.status_code == 200
    assert resp.json() == {"type": 1}


# ---------------------------------------------------------------------------
# Bad signature → 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bad_signature_returns_401(discord_client: AsyncClient) -> None:
    """Requests with an invalid signature must be rejected with 401."""
    body = _discord_payload(type=1)
    resp = await discord_client.post(
        "/discord/interactions",
        content=body,
        headers={
            "X-Signature-Ed25519": "a" * 128,  # 64 random bytes, wrong key
            "X-Signature-Timestamp": str(int(time.time())),
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_missing_signature_headers_returns_401(discord_client: AsyncClient) -> None:
    """Requests missing the signature headers entirely must be rejected with 401."""
    body = _discord_payload(type=1)
    resp = await discord_client.post(
        "/discord/interactions",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /raid ping → type 4 channel message with content
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_raid_ping_returns_message(discord_client: AsyncClient) -> None:
    """``/raid ping`` should return an ephemeral-or-public message (type 4)."""
    body = _discord_payload(
        type=2,  # APPLICATION_COMMAND
        data={
            "name": "raid",
            "options": [{"name": "ping", "type": 1}],
        },
    )
    resp = await discord_client.post(
        "/discord/interactions",
        content=body,
        headers=_discord_headers(body),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 4  # CALLBACK_TYPE_CHANNEL_MESSAGE_WITH_SOURCE
    assert "content" in data["data"]
    assert len(data["data"]["content"]) > 0


# ---------------------------------------------------------------------------
# Unknown command → ephemeral "Unknown command"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_command_returns_ephemeral(discord_client: AsyncClient) -> None:
    """An unknown slash command name should return an ephemeral error message."""
    body = _discord_payload(
        type=2,
        data={"name": "nonexistent_command_xyz"},
    )
    resp = await discord_client.post(
        "/discord/interactions",
        content=body,
        headers=_discord_headers(body),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 4
    # Must be ephemeral (flag 64)
    assert data["data"].get("flags") == 64
    assert "unknown" in data["data"]["content"].lower()


# ---------------------------------------------------------------------------
# Handler exception → ephemeral generic error (never a 5xx)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handler_exception_returns_ephemeral_not_500(
    discord_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unhandled exception in a command handler must NOT propagate as 500.

    Discord would show the interaction as permanently "failed" with no
    message.  The router catches all exceptions and returns an ephemeral
    generic error instead.
    """
    from app.services.discord import dispatcher

    async def _boom(payload: Any) -> Any:
        raise RuntimeError("simulated handler crash")

    monkeypatch.setitem(dispatcher._COMMAND_HANDLERS, "raid", _boom)

    body = _discord_payload(
        type=2,
        data={"name": "raid", "options": [{"name": "ping", "type": 1}]},
    )
    resp = await discord_client.post(
        "/discord/interactions",
        content=body,
        headers=_discord_headers(body),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 4
    assert data["data"].get("flags") == 64  # ephemeral
    assert "wrong" in data["data"]["content"].lower() or "error" in data["data"]["content"].lower()


# ---------------------------------------------------------------------------
# When discord_enabled=False: route absent (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_discord_route_absent_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When DISCORD_ENABLED=false the interactions route must not be mounted (404)."""
    monkeypatch.setattr(settings, "discord_enabled", False)

    from app.main import create_app

    disabled_app = create_app()
    body = _discord_payload(type=1)
    async with AsyncClient(
        transport=ASGITransport(app=disabled_app),
        base_url="http://test",
    ) as ac:
        resp = await ac.post(
            "/discord/interactions",
            content=body,
            headers=_discord_headers(body),
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# CLI: discord-register-commands no-op when disabled
# ---------------------------------------------------------------------------


def test_discord_register_commands_noop_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """discord-register-commands must exit 0 with a clear message when disabled."""
    import sys

    monkeypatch.setattr(settings, "discord_enabled", False)
    monkeypatch.setattr(sys, "argv", ["app.cli", "discord-register-commands"])

    from app.cli import _run_discord_register_commands

    exit_code = _run_discord_register_commands()
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "DISCORD_ENABLED=false" in out


# ---------------------------------------------------------------------------
# Boot guard: raises when enabled with missing values
# ---------------------------------------------------------------------------


def test_boot_guard_raises_in_production_when_vars_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_check_discord_configured must raise when DISCORD_ENABLED=true in production
    and any required var is empty."""
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_application_id", "")
    monkeypatch.setattr(settings, "discord_public_key", "")
    monkeypatch.setattr(settings, "discord_bot_token", "")
    monkeypatch.setattr(settings, "environment", "production")

    from app.main import DiscordNotConfiguredError, _check_discord_configured

    with pytest.raises(DiscordNotConfiguredError) as exc_info:
        _check_discord_configured()

    msg = str(exc_info.value)
    assert "DISCORD_APPLICATION_ID" in msg
    assert "DISCORD_PUBLIC_KEY" in msg
    assert "DISCORD_BOT_TOKEN" in msg


def test_boot_guard_no_op_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_check_discord_configured must be a no-op when discord_enabled=False."""
    monkeypatch.setattr(settings, "discord_enabled", False)
    monkeypatch.setattr(settings, "environment", "production")

    from app.main import _check_discord_configured

    # Must not raise
    _check_discord_configured()


def test_boot_guard_no_op_when_fully_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_check_discord_configured must be a no-op when all required vars are set."""
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_application_id", "123")
    monkeypatch.setattr(settings, "discord_public_key", _PUBLIC_KEY_HEX)
    monkeypatch.setattr(settings, "discord_bot_token", "token")
    monkeypatch.setattr(settings, "environment", "production")

    from app.main import _check_discord_configured

    # Must not raise
    _check_discord_configured()
