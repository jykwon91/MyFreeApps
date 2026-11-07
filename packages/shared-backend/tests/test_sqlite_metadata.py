"""patch_metadata_for_sqlite keeps PostgreSQL-typed columns round-tripping on SQLite."""
import uuid

from sqlalchemy import JSON, Column, Computed, Integer, MetaData, String, Table, Uuid, create_engine, insert, select, text
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, UUID

from platform_shared.testing.sqlite_metadata import patch_metadata_for_sqlite

# A valid uuid4 whose hex is all digits plus one "e": SQLite's NUMERIC
# affinity would read it as a number.
NUMERIC_LOOKING_ID = uuid.UUID("12345678-9012-4345-8789-0123456e7890")


def _table() -> tuple[MetaData, Table]:
    metadata = MetaData()
    table = Table(
        "things",
        metadata,
        Column("id", UUID(as_uuid=True), primary_key=True),
        Column("payload", JSONB),
        Column("tags", ARRAY(String)),
        Column("ip", INET),
        Column("n", Integer),
        Column("n_doubled", Integer, Computed("n * 2")),
    )
    return metadata, table


def test_numeric_looking_uuid_round_trips() -> None:
    metadata, table = _table()
    patch_metadata_for_sqlite(metadata)
    engine = create_engine("sqlite:///:memory:")
    metadata.create_all(engine)

    with engine.begin() as conn:
        conn.execute(insert(table).values(id=NUMERIC_LOOKING_ID, n=1))
        stored = conn.execute(select(table.c.id)).scalar_one()

    assert stored == NUMERIC_LOOKING_ID


def test_swaps_postgres_types_for_portable_ones() -> None:
    metadata, table = _table()
    patch_metadata_for_sqlite(metadata)

    assert isinstance(table.c.id.type, Uuid)
    assert not isinstance(table.c.id.type, UUID)
    assert table.c.id.type.as_uuid is True
    assert isinstance(table.c.payload.type, JSON)
    assert isinstance(table.c.tags.type, JSON)
    assert isinstance(table.c.ip.type, String)
    assert table.c.n_doubled.computed is None
    assert table.c.n_doubled.nullable is True


def test_string_uuid_columns_keep_the_32_hex_storage_format() -> None:
    metadata = MetaData()
    table = Table("refs", metadata, Column("ref", UUID(as_uuid=False)))
    patch_metadata_for_sqlite(metadata)
    engine = create_engine("sqlite:///:memory:")
    metadata.create_all(engine)

    with engine.begin() as conn:
        conn.execute(insert(table).values(ref=str(NUMERIC_LOOKING_ID)))
        stored = conn.execute(text("SELECT ref, typeof(ref) FROM refs")).one()
        returned = conn.execute(select(table.c.ref)).scalar_one()

    assert tuple(stored) == (NUMERIC_LOOKING_ID.hex, "text")
    assert returned == str(NUMERIC_LOOKING_ID)
