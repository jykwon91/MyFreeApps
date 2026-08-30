"""Tests for platform_shared.core.signed_url.

The security property under test: a token authorises ONE payload under ONE
secret for a BOUNDED time, and nothing else. Each test below is one way an
attacker would try to widen that.
"""
from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from platform_shared.core.signed_url import (
    SignatureError,
    sign_payload,
    verify_payload,
)

SECRET = "test-secret-key"
URL = "https://images.example.com/flan.jpg"


class TestRoundTrip:
    def test_signed_payload_verifies(self) -> None:
        token = sign_payload(URL, secret=SECRET, ttl_seconds=300)
        verify_payload(URL, token, secret=SECRET)  # does not raise

    def test_token_is_url_safe(self) -> None:
        """Tokens ride in a query string — no padding, no '+' or '/'."""
        token = sign_payload(URL, secret=SECRET, ttl_seconds=300)
        assert "=" not in token
        assert "+" not in token
        assert "/" not in token

    def test_distinct_payloads_get_distinct_tokens(self) -> None:
        a = sign_payload("https://a.example/x.jpg", secret=SECRET, ttl_seconds=300)
        b = sign_payload("https://b.example/x.jpg", secret=SECRET, ttl_seconds=300)
        assert a.split(".")[1] != b.split(".")[1]


class TestRejections:
    def test_different_payload_rejected(self) -> None:
        """The whole point: a token for one URL must not fetch another."""
        token = sign_payload(URL, secret=SECRET, ttl_seconds=300)
        with pytest.raises(SignatureError):
            verify_payload("https://evil.example/steal.jpg", token, secret=SECRET)

    def test_different_secret_rejected(self) -> None:
        token = sign_payload(URL, secret="other-secret", ttl_seconds=300)
        with pytest.raises(SignatureError):
            verify_payload(URL, token, secret=SECRET)

    def test_expired_token_rejected(self) -> None:
        token = sign_payload(URL, secret=SECRET, ttl_seconds=60)
        with patch("platform_shared.core.signed_url.time.time", return_value=time.time() + 3600):
            with pytest.raises(SignatureError, match="expired"):
                verify_payload(URL, token, secret=SECRET)

    def test_extended_expiry_rejected(self) -> None:
        """The expiry is inside the signed material — editing it breaks the MAC."""
        token = sign_payload(URL, secret=SECRET, ttl_seconds=60)
        _, _, signature = token.partition(".")
        forged = f"{int(time.time()) + 999_999}.{signature}"
        with pytest.raises(SignatureError, match="mismatch"):
            verify_payload(URL, forged, secret=SECRET)

    @pytest.mark.parametrize(
        "token", ["", "garbage", "nodot", "abc.def", ".", "999999999"]
    )
    def test_malformed_tokens_rejected(self, token: str) -> None:
        with pytest.raises(SignatureError):
            verify_payload(URL, token, secret=SECRET)

    def test_empty_secret_refuses_to_sign(self) -> None:
        """Signing with '' would let any deployment forge tokens — fail loud."""
        with pytest.raises(ValueError):
            sign_payload(URL, secret="", ttl_seconds=300)

    def test_empty_secret_refuses_to_verify(self) -> None:
        with pytest.raises(ValueError):
            verify_payload(URL, "1.abc", secret="")

    def test_non_positive_ttl_rejected(self) -> None:
        with pytest.raises(ValueError):
            sign_payload(URL, secret=SECRET, ttl_seconds=0)
