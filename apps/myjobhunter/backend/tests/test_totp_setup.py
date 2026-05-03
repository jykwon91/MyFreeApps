"""TOTP enrollment endpoints — setup, verify, disable, status.

Each test creates a fresh user, drives the TOTP flow through the API, and
asserts both the wire response and the persisted state. Encryption-at-rest
is verified by reading the raw column value via a separate session that
does NOT go through the ``EncryptedString`` decoder.

After the SHA-256 KDF migration (2026-05-02), all new enrollments via
``POST /auth/totp/setup`` generate a SHA-256 TOTP secret. Tests that verify
a 6-digit code must use ``pyotp.TOTP(secret, digest=hashlib.sha256).now()``
to generate a code that the server will accept.
"""
import hashlib
import uuid

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


@pytest.mark.asyncio
async def test_setup_returns_secret_uri_and_recovery_codes(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.post("/auth/totp/setup")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "secret" in body
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert "issuer=MyJobHunter" in body["provisioning_uri"]
    assert isinstance(body["recovery_codes"], list)
    assert len(body["recovery_codes"]) == 8
    # Recovery codes are 8 uppercase hex characters
    for code in body["recovery_codes"]:
        assert len(code) == 8
        assert code.isupper() or code.isdigit() or all(c in "0123456789ABCDEF" for c in code)


@pytest.mark.asyncio
async def test_setup_does_not_enable_totp_yet(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        await authed.post("/auth/totp/setup")
        status = await authed.get("/auth/totp/status")

    assert status.status_code == 200
    assert status.json()["enabled"] is False


@pytest.mark.asyncio
async def test_setup_rejects_when_already_enabled(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        await authed.post("/auth/totp/verify", json={"code": code})

        # Second setup attempt should be rejected
        resp = await authed.post("/auth/totp/setup")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_with_correct_code_enables_totp(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        verify = await authed.post("/auth/totp/verify", json={"code": code})
        status = await authed.get("/auth/totp/status")

    assert verify.status_code == 200
    assert verify.json() == {"verified": True}
    assert status.json()["enabled"] is True


@pytest.mark.asyncio
async def test_verify_with_wrong_code_returns_400(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        await authed.post("/auth/totp/setup")
        resp = await authed.post("/auth/totp/verify", json={"code": "000000"})
        status = await authed.get("/auth/totp/status")

    assert resp.status_code == 400
    # Failed verify must not flip totp_enabled
    assert status.json()["enabled"] is False


@pytest.mark.asyncio
async def test_disable_requires_current_totp_code(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        # Enroll
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        await authed.post("/auth/totp/verify", json={"code": pyotp.TOTP(secret, digest=hashlib.sha256).now()})

        # Wrong code is rejected — 2FA stays enabled
        bad = await authed.post("/auth/totp/disable", json={"code": "000000"})
        status_after_bad = await authed.get("/auth/totp/status")

        # Correct code disables
        good = await authed.post("/auth/totp/disable", json={"code": pyotp.TOTP(secret, digest=hashlib.sha256).now()})
        status_after_good = await authed.get("/auth/totp/status")

    assert bad.status_code == 400
    assert status_after_bad.json()["enabled"] is True
    assert good.status_code == 200
    assert good.json() == {"disabled": True}
    assert status_after_good.json()["enabled"] is False


@pytest.mark.asyncio
async def test_disable_clears_totp_secret_and_recovery_codes(
    client: AsyncClient, user_factory, as_user,
) -> None:
    """After disable, the user row must have ``totp_secret`` and
    ``totp_recovery_codes`` cleared so a new enrollment can start clean."""
    user = await user_factory()
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        secret = setup.json()["secret"]
        await authed.post("/auth/totp/verify", json={"code": pyotp.TOTP(secret, digest=hashlib.sha256).now()})
        await authed.post("/auth/totp/disable", json={"code": pyotp.TOTP(secret, digest=hashlib.sha256).now()})

    # Read raw row to confirm fields are cleared
    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(eng, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            row = await sess.execute(
                text("SELECT totp_secret, totp_recovery_codes, totp_enabled FROM users WHERE email = :e"),
                {"e": user["email"]},
            )
            r = row.one_or_none()
    await eng.dispose()
    assert r is not None
    assert r.totp_secret is None
    assert r.totp_recovery_codes is None
    assert r.totp_enabled is False


@pytest.mark.asyncio
async def test_totp_secret_encrypted_at_rest(
    client: AsyncClient, user_factory, as_user,
) -> None:
    """Read the raw column bytes and confirm they are NOT the plaintext secret.

    This is the contract that justifies storing the secret in the DB at all —
    a leaked database dump must not yield usable TOTP secrets.
    """
    user = await user_factory()
    async with await as_user(user) as authed:
        setup = await authed.post("/auth/totp/setup")
        plaintext_secret = setup.json()["secret"]
        plaintext_recovery = setup.json()["recovery_codes"]

    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(eng, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            row = await sess.execute(
                text("SELECT totp_secret, totp_recovery_codes FROM users WHERE email = :e"),
                {"e": user["email"]},
            )
            r = row.one()
    await eng.dispose()

    # Stored ciphertexts are present but neither equals the plaintext.
    assert r.totp_secret is not None and r.totp_secret != plaintext_secret
    assert r.totp_recovery_codes is not None
    for code in plaintext_recovery:
        assert code not in r.totp_recovery_codes


@pytest.mark.asyncio
async def test_setup_requires_authentication(client: AsyncClient) -> None:
    resp = await client.post("/auth/totp/setup")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_status_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/auth/totp/status")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_verify_requires_six_digit_code(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        await authed.post("/auth/totp/setup")
        # 5 digits — schema rejects
        resp = await authed.post("/auth/totp/verify", json={"code": "12345"})
    assert resp.status_code == 422
