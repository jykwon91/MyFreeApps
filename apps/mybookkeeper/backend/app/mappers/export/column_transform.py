"""How one column's stored value is turned into what the export shows."""
from collections.abc import Callable
from dataclasses import dataclass

from app.db.base import Base
from app.mappers.export.json_value import JsonValue


@dataclass(frozen=True)
class ColumnTransform:
    """Exports a column under ``exported_as`` as ``transform(row, stored_value)``.

    Used where the app never shows the stored value as is: raw ciphertext
    shown decrypted, tax IDs shown masked, a settings blob of which one entry
    is shown.
    """

    exported_as: str
    transform: Callable[[Base, object], JsonValue]
