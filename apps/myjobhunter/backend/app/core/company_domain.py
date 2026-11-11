"""Normalise ``companies.primary_domain`` to a bare, lowercase, ASCII hostname.

``primary_domain`` is a domain, not a URL: the table enforces lowercase
(``chk_company_domain_lowercase``) and uniqueness on
``(user_id, lower(primary_domain))``, and company research passes it to
search as ``domain=``. Every writer runs values through
:func:`normalize_company_domain` so ``https://www.Acme.com/careers``,
``www.acme.com`` and ``acme.com`` are the same stored value.

This server-side normaliser is the authority on what gets stored. The
clients' ``websiteToDomain``
(``apps/myjobhunter/api-client/src/utils/websiteToDomain.ts``) is only a
best-effort guess made before sending, and can differ from it.

Rules, in order: trim; take the host (dropping scheme, userinfo, path, query,
fragment and port); encode it with IDNA 2008 / UTS 46 (as browsers' URL
parsers do: lowercases, maps full-width forms and ideographic dots, and turns
``straße.de`` into ``xn--strae-oqa.de``); drop a trailing dot; drop leading
``www.``; then require a multi-label hostname of at most 253 characters. A
blank value means "no domain".
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

import idna

_MAX_HOSTNAME_LEN = 253
_WWW_PREFIX = "www."
_LABEL_RE = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
_NUMERIC_RE = re.compile(r"^[0-9]+$")


def normalize_company_domain(value: str | None) -> str | None:
    """Return ``value`` as a bare hostname, or ``None`` when it is blank.

    Raises ``ValueError`` when what remains is not a valid multi-label
    hostname (IP addresses and single-label names such as ``localhost``
    are not company domains).
    """
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None

    try:
        host = urlsplit(text if "://" in text else f"//{text}").hostname
    except ValueError as exc:
        raise _invalid(value) from exc
    if not host:
        raise _invalid(value)

    # Encode first: UTS 46 lowercases and maps full-width letters and
    # ideographic dots ("ｗｗｗ.", "。") to ASCII, so the trailing-dot and
    # "www." steps below see the final form and the result is idempotent.
    try:
        host = idna.encode(host, uts46=True).decode("ascii")
    except idna.IDNAError as exc:
        raise _invalid(value) from exc

    host = host.removesuffix(".")
    # Repeat so "www.www.acme.com" settles in one call; keep "www.com".
    while host.startswith(_WWW_PREFIX) and "." in host[len(_WWW_PREFIX):]:
        host = host[len(_WWW_PREFIX):]

    labels = host.split(".")
    if (
        len(host) > _MAX_HOSTNAME_LEN
        or len(labels) < 2
        or not all(_LABEL_RE.match(label) for label in labels)
        or _NUMERIC_RE.match(labels[-1])
    ):
        raise _invalid(value)
    return host


def _invalid(value: str) -> ValueError:
    return ValueError(
        f"primary_domain must be a website domain such as 'acme.com'; got {value!r}",
    )
