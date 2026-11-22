"""Hide the email addresses in text that is logged or kept in an error message."""
from __future__ import annotations

import re

from platform_shared.core.mask_email import mask_email

# A local part is a quoted string (``"jane doe"``) or a run that stops at
# whitespace, brackets, quotes, ``/`` and ``,;:=``, so SMTP replies
# (``<bob@x.com>``), Python reprs (``'jos\xe9@x.com'``), labels
# (``to=bob@x.com``) and URLs (``https://bob@x.com``) keep their punctuation.
_LOCAL = r"(?:\"[^\"\r\n]*\"|[^\s@<>()\[\]\"',;:=/]+)"
# A domain label is any run of non-separators, so non-ASCII domains
# (``bücher.de``) and the ``\xc3\xbc`` escapes of a bytes repr both match.
_LABEL = r"[^\s@<>()\[\]\"',;:=/?#.]+"
# In free text the domain needs a dot, so ``pkg@latest`` isn't taken for an
# address; inside ``<...>``, the form SMTP replies use, a dotless one counts too.
_EMAIL_SHAPED = re.compile(
    rf"{_LOCAL}@{_LABEL}(?:\.{_LABEL})+|(?<=<){_LOCAL}@{_LABEL}(?=>)"
)


def mask_email_addresses(text: str) -> str:
    """``text`` with every email address cut down to ``***@<domain>``. Idempotent."""
    return _EMAIL_SHAPED.sub(lambda match: mask_email(match.group(0)), text)


__all__ = ["mask_email_addresses"]
