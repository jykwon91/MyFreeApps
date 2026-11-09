"""Object storage failed while saving template files; the request can be retried."""
from __future__ import annotations


class TemplateStorageUnavailableError(RuntimeError):
    pass
