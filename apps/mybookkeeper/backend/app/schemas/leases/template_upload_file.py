"""An uploaded template file: ``(filename, content_bytes, declared_content_type)``."""
from __future__ import annotations

TemplateUploadFile = tuple[str, bytes, str | None]
