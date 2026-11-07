"""Make PostgreSQL-only column types work in SQLite test databases.

Call ``patch_metadata_for_sqlite`` before any query expression is built,
i.e. at conftest import time. SQLAlchemy memoizes a column's comparator on
first use, and reassigning ``column.type`` afterwards does not re-derive it.
"""
from sqlalchemy import JSON, MetaData, String, Uuid
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, UUID

# Fits an IPv6 address in text form.
_INET_TEXT_LENGTH = 45


def patch_metadata_for_sqlite(metadata: MetaData) -> None:
    """Swap PostgreSQL types for portable ones and drop computed columns.

    - JSONB and ARRAY become JSON; INET becomes text.
    - PostgreSQL UUID becomes the portable ``Uuid`` (CHAR(32)). SQLite gives a
      column declared ``UUID`` NUMERIC affinity, so a hex id made only of
      digits and one "e" (``1234...e56...``) would be stored as a float.
    - Computed columns become plain nullable columns, since SQLite can't
      evaluate the PostgreSQL expressions.
    """
    for table in metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, (JSONB, ARRAY)):
                column.type = JSON()
            elif isinstance(column.type, INET):
                column.type = String(_INET_TEXT_LENGTH)
            elif isinstance(column.type, UUID):
                column.type = Uuid(as_uuid=column.type.as_uuid)
            if column.computed is not None:
                column.computed = None
                column.nullable = True
