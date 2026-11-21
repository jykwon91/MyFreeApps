"""Redaction of secret-bearing URLs before they reach logs, Sentry or the DB.

Airbnb / VRBO iCal export links carry a secret token in the path or query:
anyone holding the link can read the host's booking calendar. A URL like that
must never be written in full anywhere it could be read by someone other than
its owner. The redacted form keeps the host (which channel failed) plus a short
hash (so two different feeds stay distinguishable) and drops the path and query.
"""
import hashlib
import re
from urllib.parse import urlsplit

from app.core.url_redaction_constants import REDACTED_URL_HASH_LENGTH, URL_IN_TEXT_PATTERN

_URL_IN_TEXT = re.compile(URL_IN_TEXT_PATTERN)


def redact_url(url: str) -> str:
    """Return ``host#<short-hash>`` for ``url``; never the path, query or userinfo."""
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:REDACTED_URL_HASH_LENGTH]
    try:
        host = urlsplit(url).hostname
    except ValueError:
        host = None
    return f"{host or 'invalid-url'}#{digest}"


def redact_urls_in_text(text: str) -> str:
    """Replace every http(s) URL embedded in ``text`` with its redacted form."""
    return _URL_IN_TEXT.sub(lambda match: redact_url(match.group(0)), text)
