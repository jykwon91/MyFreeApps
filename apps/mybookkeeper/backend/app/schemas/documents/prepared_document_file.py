"""A file from an upload, cleaned and keyed, before its document row is written."""
from __future__ import annotations

from dataclasses import dataclass

from platform_shared.schemas.storage.new_stored_object import NewStoredObject


@dataclass(frozen=True)
class PreparedDocumentFile:
    file_name: str
    file_type: str
    stored: NewStoredObject
