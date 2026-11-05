"""Unit tests for ``platform_shared.core.request_utils.get_client_ip``."""
from unittest.mock import MagicMock

import pytest

from platform_shared.core.request_utils import get_client_ip


def _make_request(
    *,
    client_host: str | None = "1.2.3.4",
    forwarded_for: str | None = None,
) -> MagicMock:
    request = MagicMock()
    headers: dict[str, str] = {}
    if forwarded_for is not None:
        headers["x-forwarded-for"] = forwarded_for
    request.headers = headers
    if client_host is None:
        request.client = None
    else:
        request.client = MagicMock()
        request.client.host = client_host
    return request


class TestGetClientIp:
    def test_returns_client_host_when_no_forwarded_header(self) -> None:
        req = _make_request(client_host="10.0.0.5")
        assert get_client_ip(req) == "10.0.0.5"

    def test_prefers_x_forwarded_for_first_hop(self) -> None:
        req = _make_request(
            client_host="172.16.0.1",  # proxy
            forwarded_for="203.0.113.5, 10.0.0.1",
        )
        assert get_client_ip(req) == "203.0.113.5"

    def test_strips_whitespace_from_forwarded_for(self) -> None:
        req = _make_request(
            client_host="172.16.0.1",
            forwarded_for="  198.51.100.7  , 10.0.0.1",
        )
        assert get_client_ip(req) == "198.51.100.7"

    def test_single_value_forwarded_for(self) -> None:
        req = _make_request(
            client_host="172.16.0.1",
            forwarded_for="198.51.100.42",
        )
        assert get_client_ip(req) == "198.51.100.42"

    def test_returns_unknown_when_no_client(self) -> None:
        req = _make_request(client_host=None)
        assert get_client_ip(req) == "unknown"


@pytest.mark.parametrize(
    "forwarded",
    ["x" * 46, "not-an-ip", "1.2.3.4:443", "fe80::1%" + "a" * 50, ", 1.2.3.4"],
    ids=["oversized", "text", "with-port", "scoped", "empty-first-hop"],
)
def test_a_forwarded_value_that_isnt_an_ip_falls_back_to_the_peer(forwarded: str) -> None:
    assert get_client_ip(_make_request(client_host="172.16.0.1", forwarded_for=forwarded)) == "172.16.0.1"
