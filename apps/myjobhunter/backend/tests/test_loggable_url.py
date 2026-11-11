"""``loggable_url`` keeps where a link points and drops what could identify the person."""
from __future__ import annotations

import pytest

from app.core.loggable_url import loggable_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://jobs.example.com/posting/123", "https://jobs.example.com/posting/123"),
        ("https://jobs.example.com/posting/123?token=s3cret&utm=x", "https://jobs.example.com/posting/123"),
        ("https://jobs.example.com/posting/123#apply-now", "https://jobs.example.com/posting/123"),
        ("https://jobs.example.com/p?a=1#frag", "https://jobs.example.com/p"),
        ("https://me:hunter2@jobs.example.com/p", "https://jobs.example.com/p"),
        ("http://jobs.example.com:8080/p?x=1", "http://jobs.example.com:8080/p"),
        ("  https://jobs.example.com/p  ", "https://jobs.example.com/p"),
        ("https://jobs.example.com:99999/p?x=1", "https://jobs.example.com/p"),
    ],
)
def test_loggable_url(url: str, expected: str) -> None:
    assert loggable_url(url) == expected
