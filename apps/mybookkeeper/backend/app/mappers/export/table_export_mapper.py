"""Maps one row of one table to its dict in the account data export."""
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import cache

from app.db.base import Base
from app.mappers.export.column_transform import ColumnTransform
from app.mappers.export.export_value_mapper import to_export_value
from app.mappers.export.json_value import JsonValue


@cache
def _attribute_keys(model: type[Base]) -> dict[str, str]:
    """Column name -> ORM attribute name (they differ for e.g. ``metadata``)."""
    return {prop.columns[0].name: prop.key for prop in model.__mapper__.column_attrs}


@dataclass(frozen=True)
class TableExportMapper:
    """The exported columns of one table, listed explicitly.

    A column is exported only when it is named here, so a new column never
    reaches the export (or leaks a secret) without being opted in. Columns
    left out are recorded with their reason in
    ``app.core.account_export_constants.EXPORT_EXCLUDED_COLUMNS``.

    ``transformed_columns`` exports a column the app never shows as stored
    (ciphertext, an unmasked tax ID, a settings blob) as the app shows it.
    """

    model: type[Base]
    columns: tuple[str, ...]
    transformed_columns: Mapping[str, ColumnTransform] = field(default_factory=dict)

    @property
    def table_name(self) -> str:
        return self.model.__table__.name

    def __call__(self, row: Base) -> dict[str, JsonValue]:
        keys = _attribute_keys(self.model)
        exported: dict[str, JsonValue] = {
            column: to_export_value(getattr(row, keys[column])) for column in self.columns
        }
        for column, column_transform in self.transformed_columns.items():
            exported[column_transform.exported_as] = column_transform.transform(
                row, getattr(row, keys[column]),
            )
        return exported
