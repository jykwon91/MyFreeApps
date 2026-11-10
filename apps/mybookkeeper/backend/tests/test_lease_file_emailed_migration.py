"""The per-file email stamp backfill keeps every file locked that was locked before.

Before, a record file was locked by being uploaded at or before the lease's
last email. The backfill stamps exactly those files, and only the kinds the
documents email sends. The MBK suite has no Postgres fixture, so this runs the
migration on SQLite; the same ``UPDATE ... FROM`` is valid Postgres.
"""
from __future__ import annotations

import datetime as _dt
import importlib.util
import uuid
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.db.base import Base

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "leasefileemail261110_add_attachment_emailed_to_tenant_at.py"
)
T = _dt.datetime(2026, 3, 1, 12)
HOUR = _dt.timedelta(hours=1)


def _run(conn: sa.Connection, step: str) -> None:
    spec = importlib.util.spec_from_file_location("leasefileemail", _MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, step)()


def _columns(conn: sa.Connection) -> set[str]:
    return {c["name"] for c in sa.inspect(conn).get_columns("signed_lease_attachments")}


def test_backfill_stamps_the_emailed_record_files_and_downgrade_drops_the_column() -> None:
    engine = sa.create_engine("sqlite://")
    leases, files = Base.metadata.tables["signed_leases"], Base.metadata.tables["signed_lease_attachments"]
    Base.metadata.create_all(engine, tables=[leases, files])
    emailed_lease, unemailed_lease = uuid.uuid4(), uuid.uuid4()
    user = uuid.uuid4()
    rows = {
        "before": (emailed_lease, "signed_lease", T - HOUR),
        "at": (emailed_lease, "rendered_original", T),
        "after": (emailed_lease, "signed_lease", T + HOUR),
        "other_kind": (emailed_lease, "signed_addendum", T - HOUR),
        "never_emailed": (unemailed_lease, "rendered_original", T - HOUR),
    }
    ids = {name: uuid.uuid4() for name in rows}
    with engine.begin() as conn:
        conn.execute(sa.text("ALTER TABLE signed_lease_attachments DROP COLUMN emailed_to_tenant_at"))
        for lease_id, stamp in ((emailed_lease, T), (unemailed_lease, None)):
            conn.execute(leases.insert().values(
                id=lease_id, user_id=user, organization_id=uuid.uuid4(), applicant_id=uuid.uuid4(),
                kind="generated", status="sent", values={}, last_emailed_to_tenant_at=stamp,
            ))
        for name, (lease_id, kind, at) in rows.items():
            conn.execute(files.insert().values(
                id=ids[name], lease_id=lease_id, storage_key="k", filename="f.pdf", content_type="application/pdf",
                size_bytes=1, kind=kind, uploaded_by_user_id=user, uploaded_at=at,
            ))

    with engine.begin() as conn:
        _run(conn, "upgrade")
    with engine.connect() as conn:
        stamped = dict(conn.execute(sa.select(files.c.id, files.c.emailed_to_tenant_at)).all())
    by_name = {name: stamped[ids[name]] for name in rows}
    assert {name for name, at in by_name.items() if at is not None} == {"before", "at"}
    assert by_name["before"].replace(tzinfo=None) == T

    with engine.begin() as conn:
        _run(conn, "downgrade")
    with engine.connect() as conn:
        assert "emailed_to_tenant_at" not in _columns(conn)
