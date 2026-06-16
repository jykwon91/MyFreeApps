"""Tests for the SSRF-safe URL validator (``platform_shared.core.url_safety``).

Coverage is organised by attacker bypass class, because an SSRF guard is
only as good as the encodings/redirects it fails to anticipate:

- scheme smuggling (``file://``, ``gopher://``, ``data:`` …)
- non-web ports (reach an internal service on ``:8000`` / ``:5432``)
- every non-public IP class (loopback, RFC1918, link-local, CGNAT,
  reserved, unspecified, multicast)
- cloud metadata IPs (``169.254.169.254``, ``fd00:ec2::254``)
- IPv4-mapped IPv6 (``::ffff:10.0.0.1``)
- userinfo host smuggling (``http://trusted.com@127.0.0.1``)
- multi-answer DNS rebinding (one reply mixing a public + private address)
- unresolvable hosts

Literal-IP cases need no network — ``getaddrinfo`` recognises numeric forms
and returns them without a DNS lookup, so they are deterministic on every
platform. Hostname cases patch ``_resolve_host`` to keep tests offline.
"""
from __future__ import annotations

import ipaddress
import socket
from unittest.mock import patch

import pytest

from platform_shared.core import url_safety
from platform_shared.core.url_safety import (
    UnsafeURLError,
    assert_url_safe,
    validate_public_url,
)

_RESOLVE = "platform_shared.core.url_safety._resolve_host"


def _addrs(*ips: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    return [ipaddress.ip_address(ip) for ip in ips]


# ---------------------------------------------------------------------------
# _is_disallowed_ip — pure IP classification (no network)
# ---------------------------------------------------------------------------


class TestIsDisallowedIp:
    @pytest.mark.parametrize(
        "ip",
        [
            "127.0.0.1",  # loopback
            "127.0.0.5",
            "10.0.0.1",  # RFC1918
            "172.16.5.4",
            "192.168.1.1",
            "169.254.169.254",  # link-local / cloud metadata
            "169.254.1.1",
            "100.64.0.1",  # CGNAT shared address space
            "0.0.0.0",  # unspecified
            "192.0.2.1",  # TEST-NET-1 (reserved/documentation)
            "224.0.0.1",  # multicast
            "240.0.0.1",  # reserved (future use)
            "::1",  # IPv6 loopback
            "fe80::1",  # IPv6 link-local
            "fc00::1",  # IPv6 unique-local
            "fd00:ec2::254",  # IPv6 cloud metadata
            "::ffff:127.0.0.1",  # IPv4-mapped loopback
            "::ffff:10.0.0.1",  # IPv4-mapped RFC1918
            "::",  # IPv6 unspecified
        ],
    )
    def test_non_public_addresses_blocked(self, ip: str) -> None:
        assert url_safety._is_disallowed_ip(ipaddress.ip_address(ip)) is True

    @pytest.mark.parametrize(
        "ip",
        [
            "8.8.8.8",  # Google DNS
            "1.1.1.1",  # Cloudflare DNS
            "93.184.216.34",  # example.com historical
            "2606:4700:4700::1111",  # Cloudflare IPv6
        ],
    )
    def test_public_addresses_allowed(self, ip: str) -> None:
        assert url_safety._is_disallowed_ip(ipaddress.ip_address(ip)) is False


# ---------------------------------------------------------------------------
# Scheme + port enforcement
# ---------------------------------------------------------------------------


class TestSchemeAndPort:
    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",
            "ftp://example.com/x",
            "gopher://example.com/_x",
            "data:text/plain,hello",
            "dict://example.com:11211/",
            "//example.com/x",  # scheme-relative → empty scheme
        ],
    )
    def test_non_http_schemes_rejected(self, url: str) -> None:
        with pytest.raises(UnsafeURLError, match="scheme"):
            validate_public_url(url)

    @pytest.mark.parametrize("url", ["", "   "])
    def test_empty_rejected(self, url: str) -> None:
        with pytest.raises(UnsafeURLError, match="non-empty"):
            validate_public_url(url)

    def test_missing_host_rejected(self) -> None:
        with pytest.raises(UnsafeURLError, match="host"):
            validate_public_url("https://")

    @pytest.mark.parametrize("port", [8000, 9000, 5432, 22, 6379, 3000])
    def test_non_web_ports_rejected(self, port: int) -> None:
        # Public IP so only the port can be the cause.
        with pytest.raises(UnsafeURLError, match="port"):
            validate_public_url(f"http://8.8.8.8:{port}/")

    def test_out_of_range_port_rejected(self) -> None:
        with pytest.raises(UnsafeURLError, match="invalid port"):
            validate_public_url("http://8.8.8.8:99999/")

    def test_custom_allowed_ports(self) -> None:
        # An opt-in caller may widen the port allowlist.
        result = validate_public_url(
            "https://8.8.8.8:8443/", allowed_ports=frozenset({8443})
        )
        assert result.scheme == "https"


# ---------------------------------------------------------------------------
# Literal-IP targets (network-free, deterministic everywhere)
# ---------------------------------------------------------------------------


class TestLiteralIpTargets:
    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/admin",
            "http://127.0.0.1/",
            "http://10.0.0.5/internal",
            "http://192.168.1.1/",
            "http://172.16.0.1/",
            "http://169.254.169.254/latest/meta-data/",  # AWS IMDS
            "http://100.64.0.1/",  # CGNAT
            "http://0.0.0.0/",
            "http://[::1]/",  # IPv6 loopback
            "http://[fd00:ec2::254]/",  # IPv6 metadata
            "http://[::ffff:127.0.0.1]/",  # IPv4-mapped loopback
            "http://[::ffff:10.0.0.1]/",  # IPv4-mapped RFC1918
        ],
    )
    def test_internal_ip_literals_blocked(self, url: str) -> None:
        with pytest.raises(UnsafeURLError, match="non-public"):
            validate_public_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "http://8.8.8.8/",
            "https://1.1.1.1/",
            "https://[2606:4700:4700::1111]/",
        ],
    )
    def test_public_ip_literals_allowed(self, url: str) -> None:
        result = validate_public_url(url)
        assert result.hostname is not None

    def test_userinfo_host_smuggling_blocked(self) -> None:
        # The real host is what's after the ``@`` — must be classified, not
        # the decoy before it.
        with pytest.raises(UnsafeURLError, match="non-public"):
            validate_public_url("http://trusted.example.com@127.0.0.1/")


# ---------------------------------------------------------------------------
# Hostname resolution (patched resolver) — rebinding + metadata DNS names
# ---------------------------------------------------------------------------


class TestHostnameResolution:
    def test_hostname_resolving_to_public_allowed(self) -> None:
        with patch(_RESOLVE, return_value=_addrs("93.184.216.34")):
            result = validate_public_url("https://jobs.example.com/posting/abc")
        assert result.netloc == "jobs.example.com"

    def test_hostname_resolving_to_private_blocked(self) -> None:
        # e.g. metadata.google.internal → 169.254.169.254, or an attacker
        # domain with an A record pointing at an internal host.
        with patch(_RESOLVE, return_value=_addrs("169.254.169.254")):
            with pytest.raises(UnsafeURLError, match="non-public"):
                validate_public_url("http://metadata.attacker.example/")

    def test_multi_answer_rebinding_blocked(self) -> None:
        # A single DNS reply mixing a public and a private answer must be
        # rejected — we reject if ANY resolved address is non-public.
        with patch(_RESOLVE, return_value=_addrs("93.184.216.34", "10.0.0.7")):
            with pytest.raises(UnsafeURLError, match="non-public"):
                validate_public_url("https://rebind.attacker.example/")

    def test_all_public_answers_allowed(self) -> None:
        with patch(_RESOLVE, return_value=_addrs("8.8.8.8", "1.1.1.1")):
            result = validate_public_url("https://cdn.example.com/")
        assert result.hostname == "cdn.example.com"

    def test_unresolvable_host_rejected(self) -> None:
        with patch(
            "platform_shared.core.url_safety.socket.getaddrinfo",
            side_effect=socket.gaierror("Name or service not known"),
        ):
            with pytest.raises(UnsafeURLError, match="could not resolve"):
                validate_public_url("https://does-not-exist.invalid/")


# ---------------------------------------------------------------------------
# Async wrapper
# ---------------------------------------------------------------------------


class TestAssertUrlSafe:
    async def test_allows_public(self) -> None:
        result = await assert_url_safe("https://1.1.1.1/")
        assert result.scheme == "https"

    async def test_blocks_internal(self) -> None:
        with pytest.raises(UnsafeURLError):
            await assert_url_safe("http://169.254.169.254/latest/meta-data/")

    async def test_blocks_via_patched_resolver(self) -> None:
        with patch(_RESOLVE, return_value=_addrs("10.1.2.3")):
            with pytest.raises(UnsafeURLError, match="non-public"):
                await assert_url_safe("https://internal.attacker.example/")
