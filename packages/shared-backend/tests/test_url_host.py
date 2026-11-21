"""Tests for ``platform_shared.core.url_host.url_host``."""
from __future__ import annotations

import pytest

from platform_shared.core.url_host import url_host


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://Calendar.Example.com/feed.ics?token=secret", "calendar.example.com"),
        ("https://user:pass@host.example:8443/x", "host.example"),
        ("http://[::1]/", "::1"),
        ("not a url", ""),
        ("http://[::1", ""),  # malformed: urlsplit raises, url_host must not
    ],
)
def test_url_host(url: str, expected: str) -> None:
    assert url_host(url) == expected
