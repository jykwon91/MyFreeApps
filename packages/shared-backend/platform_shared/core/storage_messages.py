"""What a request is told when object storage isn't configured.

``StorageNotConfiguredError`` names the unset ``MINIO_*`` env vars, which is
for the operator: routes log it and send this fixed copy instead.
"""
from __future__ import annotations

from typing import Final

STORAGE_NOT_CONFIGURED_DETAIL: Final = "File storage is not available — contact support"
