"""Object storage failed while saving template files; the request can be retried."""
from __future__ import annotations


class TemplateStorageUnavailableError(RuntimeError):
    """Routes reply with ``STORAGE_UNAVAILABLE_MESSAGE``, never this exception's text.

    The underlying storage error is the ``__cause__``; it is logged, not sent.
    """
