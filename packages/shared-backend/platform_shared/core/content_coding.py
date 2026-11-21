"""Reading the single content coding a response body was sent with."""
from __future__ import annotations

from platform_shared.core.capped_fetch_constants import (
    CONTENT_CODING_ALIASES,
    SUPPORTED_CONTENT_CODINGS,
)


def single_content_coding(content_encoding: str) -> str | None:
    """The one supported coding named by a ``Content-Encoding`` value, or ``None``.

    An absent or empty header means ``identity``. ``None`` means refuse: an
    unknown coding, or more than one stacked (each extra layer multiplies how
    far a small body can inflate).
    """
    codings = [c.strip().lower() for c in content_encoding.split(",") if c.strip()]
    if not codings:
        return "identity"
    if len(codings) > 1:
        return None
    coding = CONTENT_CODING_ALIASES.get(codings[0], codings[0])
    return coding if coding in SUPPORTED_CONTENT_CODINGS else None
