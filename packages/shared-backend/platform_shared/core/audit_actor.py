"""Name the user a background job acts for, so its audited writes carry them.

Only :class:`~platform_shared.core.request_audit_middleware.RequestAuditMiddleware`
sets :data:`~platform_shared.core.audit.current_user_id`, and only for an HTTP
request with a valid token. Work started from such a request (``asyncio``
tasks, FastAPI ``BackgroundTasks``) inherits it, because both copy the context
when they start. A worker process or scheduler starts with no user, so every
row it writes would be audited with ``changed_by`` NULL: unattributable, and
missed when that user's account is deleted and their audit history erased.

A job that acts for one user runs its writes inside ``audit_actor``::

    with audit_actor(job.user_id):
        await do_the_work(job)
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from platform_shared.core.audit import current_user_id


@contextmanager
def audit_actor(user_id: uuid.UUID | str) -> Iterator[None]:
    """Audit every write inside the block as made by ``user_id``; restore the previous actor after."""
    token = current_user_id.set(str(user_id))
    try:
        yield
    finally:
        current_user_id.reset(token)


__all__ = ["audit_actor"]
