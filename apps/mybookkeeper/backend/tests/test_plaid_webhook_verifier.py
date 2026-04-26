"""Tests for Plaid webhook signature verification."""
import hashlib
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from jwt.exceptions import PyJWTError as JWTError

import app.core.plaid_webhook_verifier as verifier_module
from app.core.plaid_webhook_verifier import verify_plaid_webhook


@pytest.fixture(autouse=True)
def _clear_key_cache() -> None:
    verifier_module._key_cache.clear()
    yield
    verifier_module._key_cache.clear()


@pytest.fixture()
def configured_settings() -> MagicMock:
    mock_settings = MagicMock()
    mock_settings.plaid_client_id = 'client_abc'
    mock_settings.plaid_secret = 'secret_xyz'
    mock_settings.plaid_environment = 'sandbox'
    with patch('app.core.plaid_webhook_verifier.settings', mock_settings):
        yield mock_settings


class TestVerifyPlaidWebhookNotConfigured:
    @pytest.mark.asyncio
    async def test_returns_true_when_plaid_not_configured(self) -> None:
        mock_settings = MagicMock()
        mock_settings.plaid_client_id = ''
        mock_settings.plaid_secret = ''
        with patch('app.core.plaid_webhook_verifier.settings', mock_settings):
            result = await verify_plaid_webhook('some.jwt.token', b'body')
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_true_when_only_client_id_missing(self) -> None:
        mock_settings = MagicMock()
        mock_settings.plaid_client_id = ''
        mock_settings.plaid_secret = 'secret'
        with patch('app.core.plaid_webhook_verifier.settings', mock_settings):
            result = await verify_plaid_webhook('some.jwt.token', b'body')
        assert result is True


class TestVerifyPlaidWebhookMissingHeader:
    @pytest.mark.asyncio
    async def test_returns_false_when_header_is_none(
        self, configured_settings: MagicMock
    ) -> None:
        result = await verify_plaid_webhook(None, b'body')
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_header_is_empty_string(
        self, configured_settings: MagicMock
    ) -> None:
        result = await verify_plaid_webhook('', b'body')
        assert result is False


class TestVerifyPlaidWebhookInvalidJWT:
    @pytest.mark.asyncio
    async def test_returns_false_when_jwt_header_parse_fails(
        self, configured_settings: MagicMock
    ) -> None:
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            side_effect=JWTError('bad header'),
        ):
            result = await verify_plaid_webhook('not.a.valid.jwt', b'body')
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_jwt_missing_kid(
        self, configured_settings: MagicMock
    ) -> None:
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
        ) as mock_fetch:
            result = await verify_plaid_webhook('header.payload.sig', b'body')
        assert result is False
        mock_fetch.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_false_when_key_fetch_fails(
        self, configured_settings: MagicMock
    ) -> None:
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256', 'kid': 'key-id-1'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await verify_plaid_webhook('header.payload.sig', b'body')
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_jwt_decode_raises(
        self, configured_settings: MagicMock
    ) -> None:
        fake_key = {'kty': 'EC', 'crv': 'P-256'}
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256', 'kid': 'key-id-1'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
            return_value=fake_key,
        ), patch(
            'app.core.plaid_webhook_verifier.PyJWK',
            return_value=MagicMock(key=MagicMock()),
        ), patch(
            'app.core.plaid_webhook_verifier.jwt.decode',
            side_effect=JWTError('invalid signature'),
        ):
            result = await verify_plaid_webhook('header.payload.sig', b'body')
        assert result is False


class TestVerifyPlaidWebhookStaleTimestamp:
    @pytest.mark.asyncio
    async def test_returns_false_when_webhook_too_old(
        self, configured_settings: MagicMock
    ) -> None:
        stale_iat = int(time.time()) - 400  # beyond 300-second limit
        body = b'webhook-payload'
        body_hash = hashlib.sha256(body).hexdigest()
        fake_claims = {'iat': stale_iat, 'request_body_sha256': body_hash}
        fake_key = {'kty': 'EC'}
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256', 'kid': 'key-id-1'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
            return_value=fake_key,
        ), patch(
            'app.core.plaid_webhook_verifier.PyJWK',
            return_value=MagicMock(key=MagicMock()),
        ), patch(
            'app.core.plaid_webhook_verifier.jwt.decode',
            return_value=fake_claims,
        ):
            result = await verify_plaid_webhook('header.payload.sig', body)
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_true_when_webhook_fresh(
        self, configured_settings: MagicMock
    ) -> None:
        fresh_iat = int(time.time()) - 10
        body = b'webhook-payload'
        body_hash = hashlib.sha256(body).hexdigest()
        fake_claims = {'iat': fresh_iat, 'request_body_sha256': body_hash}
        fake_key = {'kty': 'EC'}
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256', 'kid': 'key-id-1'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
            return_value=fake_key,
        ), patch(
            'app.core.plaid_webhook_verifier.PyJWK',
            return_value=MagicMock(key=MagicMock()),
        ), patch(
            'app.core.plaid_webhook_verifier.jwt.decode',
            return_value=fake_claims,
        ):
            result = await verify_plaid_webhook('header.payload.sig', body)
        assert result is True


class TestVerifyPlaidWebhookBodyHashMismatch:
    @pytest.mark.asyncio
    async def test_returns_false_when_body_hash_does_not_match(
        self, configured_settings: MagicMock
    ) -> None:
        fresh_iat = int(time.time()) - 5
        wrong_hash = 'a' * 64
        fake_claims = {'iat': fresh_iat, 'request_body_sha256': wrong_hash}
        actual_body = b'actual-webhook-payload'
        fake_key = {'kty': 'EC'}
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256', 'kid': 'key-id-1'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
            return_value=fake_key,
        ), patch(
            'app.core.plaid_webhook_verifier.PyJWK',
            return_value=MagicMock(key=MagicMock()),
        ), patch(
            'app.core.plaid_webhook_verifier.jwt.decode',
            return_value=fake_claims,
        ):
            result = await verify_plaid_webhook('header.payload.sig', actual_body)
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_body_hash_claim_missing(
        self, configured_settings: MagicMock
    ) -> None:
        fresh_iat = int(time.time()) - 5
        fake_claims = {'iat': fresh_iat}  # no request_body_sha256
        fake_key = {'kty': 'EC'}
        with patch(
            'app.core.plaid_webhook_verifier.jwt.get_unverified_header',
            return_value={'alg': 'ES256', 'kid': 'key-id-1'},
        ), patch(
            'app.core.plaid_webhook_verifier._fetch_verification_key',
            new_callable=AsyncMock,
            return_value=fake_key,
        ), patch(
            'app.core.plaid_webhook_verifier.PyJWK',
            return_value=MagicMock(key=MagicMock()),
        ), patch(
            'app.core.plaid_webhook_verifier.jwt.decode',
            return_value=fake_claims,
        ):
            result = await verify_plaid_webhook('header.payload.sig', b'body')
        assert result is False
