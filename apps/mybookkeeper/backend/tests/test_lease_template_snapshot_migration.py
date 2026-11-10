"""The template-snapshot backfill stamps only what is known to have been rendered.

Rendered links get the template's current name (soft-deleted templates too);
the version only where the template is still at version 1, or its row has not
been updated since the lease was generated. Runs the migration on SQLite (the MBK suite has
no Postgres fixture); the correlated-subquery UPDATE is valid Postgres.
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
    / "alembic" / "versions" / "leasetplver261110_add_signed_lease_template_snapshot.py"
)
GENERATED_AT = _dt.datetime(2026, 3, 1, 12)
HOUR = _dt.timedelta(hours=1)


def _run(conn: sa.Connection, step: str) -> None:
    spec = importlib.util.spec_from_file_location("leasetplver", _MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, step)()


def test_backfill_stamps_rendered_links_with_the_version_only_where_it_is_known() -> None:
    engine = sa.create_engine("sqlite://")
    tables = [Base.metadata.tables[n] for n in ("lease_templates", "signed_leases", "signed_lease_templates")]
    templates, leases, _ = tables
    Base.metadata.create_all(engine, tables=tables)
    user, org = uuid.uuid4(), uuid.uuid4()
    # (name, version, updated_at, deleted_at)
    tpl = {
        "v1": ("Lease v1", 1, GENERATED_AT + HOUR, None),
        "v3_changed_after": ("Lease v3", 3, GENERATED_AT + HOUR, None),
        "v3_unchanged_since": ("Lease v3 steady", 3, GENERATED_AT - HOUR, None),
        "v3_updated_at_generation": ("Lease v3 same instant", 3, GENERATED_AT, None),
        "deleted": ("Retired lease", 2, GENERATED_AT + HOUR, GENERATED_AT + 2 * HOUR),
    }
    tids = {key: uuid.uuid4() for key in tpl}
    generated, draft, imported = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with engine.begin() as conn:
        for col in ("template_name_snapshot", "template_version_snapshot"):
            conn.execute(sa.text(f"ALTER TABLE signed_lease_templates DROP COLUMN {col}"))
        for key, (name, version, updated_at, deleted_at) in tpl.items():
            conn.execute(templates.insert().values(
                id=tids[key], user_id=user, organization_id=org, name=name, version=version,
                created_at=GENERATED_AT - 2 * HOUR, updated_at=updated_at, deleted_at=deleted_at,
            ))
        for lease_id, kind, at in ((generated, "generated", GENERATED_AT), (draft, "generated", None), (imported, "imported", None)):
            conn.execute(leases.insert().values(
                id=lease_id, user_id=user, organization_id=org, applicant_id=uuid.uuid4(),
                kind=kind, status="draft" if at is None else "generated", values={}, generated_at=at,
            ))
        link_rows = [(generated, tids[key]) for key in tpl]
        link_rows += [(draft, tids["v1"]), (imported, tids["v1"]), (imported, tids["v3_unchanged_since"])]
        for lease_id, tid in link_rows:
            conn.execute(sa.text(
                "INSERT INTO signed_lease_templates (lease_id, template_id, display_order) VALUES (:l, :t, 0)"
            ), {"l": lease_id.hex, "t": tid.hex})

    with engine.begin() as conn:
        _run(conn, "upgrade")
    with engine.connect() as conn:
        rows = conn.execute(sa.text(
            "SELECT lease_id, template_id, template_name_snapshot, template_version_snapshot FROM signed_lease_templates"
        )).all()
    got = {(uuid.UUID(l), uuid.UUID(t)): (n, v) for l, t, n, v in rows}
    assert got == {
        (generated, tids["v1"]): ("Lease v1", 1),
        (generated, tids["v3_changed_after"]): ("Lease v3", None),
        (generated, tids["v3_unchanged_since"]): ("Lease v3 steady", 3),
        (generated, tids["v3_updated_at_generation"]): ("Lease v3 same instant", 3),
        # Soft-deleted since: the name is still recorded.
        (generated, tids["deleted"]): ("Retired lease", None),
        (draft, tids["v1"]): (None, None),
        (imported, tids["v1"]): ("Lease v1", 1),
        # No generated_at to compare against, so a later version stays unknown.
        (imported, tids["v3_unchanged_since"]): ("Lease v3 steady", None),
    }

    with engine.begin() as conn:
        _run(conn, "downgrade")
    with engine.connect() as conn:
        cols = {c["name"] for c in sa.inspect(conn).get_columns("signed_lease_templates")}
    assert not cols & {"template_name_snapshot", "template_version_snapshot"}
