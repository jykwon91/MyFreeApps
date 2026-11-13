"""The 409 details Discover's triage endpoints answer with.

Each detail is ``{"code", "message"}`` (the shape ``DELETE /companies`` uses
for ``COMPANY_HAS_APPLICATIONS``) so clients key on the code, not the wording.

- ``ALREADY_APPLIED``: Dismiss or Save on a posting that is already an
  application — a stale card, or a tap while Apply was in flight — or Save /
  Restore on a dismissed posting whose twin (same content, another source) is.
  (Restore on an applied posting itself is a 404: the Dismissed view doesn't
  list it.)
- ``DUPLICATE``: Save or Restore on a dismissed posting whose twin is already
  in Discover. Bringing this one back would list the same posting twice, which
  ``uq_discovered_user_content_hash`` forbids.
- ``NO_LONGER_LISTED``: the same, but the twin has since expired or closed, so
  the posting is no longer listed anywhere.
"""
from __future__ import annotations

ALREADY_APPLIED_CODE = "DISCOVERED_JOB_ALREADY_APPLIED"
ALREADY_APPLIED_MESSAGE = "This posting is already in your Applications"

DUPLICATE_CODE = "DISCOVERED_JOB_DUPLICATE"
DUPLICATE_MESSAGE = "This posting is already in Discover from another source"

NO_LONGER_LISTED_CODE = "DISCOVERED_JOB_NO_LONGER_LISTED"
NO_LONGER_LISTED_MESSAGE = "This posting is no longer listed"
