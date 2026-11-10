"""An uploaded template file claims a supported type but cannot be opened."""
from __future__ import annotations


class TemplateFileUnreadableError(ValueError):
    pass
