"""``normalize_company_domain`` reduces any website spelling to a bare hostname.

Rules: trim; take the host (drop scheme, userinfo, path, query, fragment,
port); IDNA 2008 / UTS 46 encode (lowercase, full-width forms, punycode);
drop trailing dot and ``www.``; blank -> None. Anything that is not a domain
is rejected.
"""
from __future__ import annotations

import pytest

from app.core.company_domain import _MAX_HOSTNAME_LEN, normalize_company_domain
from app.models.company.company import Company


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("acme.com", "acme.com"),
        ("Acme.com", "acme.com"),
        ("ACME.COM", "acme.com"),
        ("  acme.com  ", "acme.com"),
        ("https://www.Acme.com/careers", "acme.com"),
        ("http://acme.com", "acme.com"),
        ("HTTPS://Acme.com", "acme.com"),
        ("www.acme.com", "acme.com"),
        ("www.www.acme.com", "acme.com"),
        ("acme.com.", "acme.com"),
        ("acme.com:8443", "acme.com"),
        ("acme.com/jobs?team=eng#open", "acme.com"),
        ("https://user:pw@acme.com/", "acme.com"),
        ("jobs.acme.co.uk", "jobs.acme.co.uk"),
        ("acme.example", "acme.example"),
        # "www." is only dropped when a registrable name remains.
        ("www.com", "www.com"),
        # Internationalised names are stored as punycode.
        ("Bücher.de", "xn--bcher-kva.de"),
        ("https://例え.jp/", "xn--r8jz45g.jp"),
        ("xn--bcher-kva.de", "xn--bcher-kva.de"),
        # IDNA 2008 / UTS 46 (browser) rules keep "ß"; IDNA 2003 would give "strasse.de".
        ("straße.de", "xn--strae-oqa.de"),
        ("https://Straße.de/jobs", "xn--strae-oqa.de"),
        # Full-width letters and the ideographic full stop map to ASCII
        # before the "www." and trailing-dot steps.
        ("ｗｗｗ.acme.com", "acme.com"),
        ("acme.com。", "acme.com"),
        ("Ａｃｍｅ．ｃｏｍ", "acme.com"),
    ],
)
def test_normalizes_to_bare_host(raw: str, expected: str) -> None:
    assert normalize_company_domain(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "   ", "\t\n"])
def test_blank_is_none(raw: str | None) -> None:
    assert normalize_company_domain(raw) is None


@pytest.mark.parametrize(
    "raw",
    [
        "not a domain",
        "localhost",
        "127.0.0.1",
        "http://[::1]/",
        "http://[broken",
        "https://",
        "acme..com",
        ".acme.com",
        "-acme.com",
        "acme-.com",
        "acme_corp.com",
        "☃.com",
        "xn--zz.com",
        "a" * 64 + ".com",
        ".".join(["abcdefghij"] * 25) + ".com",
    ],
)
def test_rejects_non_domains(raw: str) -> None:
    with pytest.raises(ValueError, match="primary_domain must be a website domain"):
        normalize_company_domain(raw)


@pytest.mark.parametrize(
    "raw",
    [
        "https://www.Acme.com/careers",
        "Bücher.de",
        "www.www.acme.com",
        "acme.com.",
        "ｗｗｗ.acme.com",
        "acme.com。",
    ],
)
def test_is_idempotent(raw: str) -> None:
    once = normalize_company_domain(raw)
    assert normalize_company_domain(once) == once


def test_long_url_reduces_to_short_host() -> None:
    assert normalize_company_domain("https://www.acme.com/careers/" + "x" * 2000) == "acme.com"


def test_stored_value_fits_the_column() -> None:
    # The request schemas accept long URLs; this cap is what keeps the stored
    # host inside String(255).
    assert _MAX_HOSTNAME_LEN <= Company.__table__.c.primary_domain.type.length
