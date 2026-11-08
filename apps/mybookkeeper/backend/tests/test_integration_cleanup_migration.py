"""Lock the shape of the migration that disconnects connections made by non-members or viewers.

The default suite builds its schema with ``create_all``, so the migration runs
only on deploy. Checked by hand on Postgres 18: a viewer's connection and a
non-member's are deleted, each with an ``oauth.disconnect`` event naming the
reason and org; a member's with the user role is kept; a rerun deletes nothing.
"""
from __future__ import annotations

from pathlib import Path

import pytest

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "intgcleanup261106_disconnect_orphaned_gmail.py"
)


@pytest.fixture(scope="module")
def source() -> str:
    return MIGRATION_FILE.read_text(encoding="utf-8")


def test_chains_after_the_inquiry_dates_migration(source: str) -> None:
    assert 'down_revision: Union[str, None] = "inqdates261107"' in source


def test_deletes_only_connections_without_a_non_viewer_membership(source: str) -> None:
    delete = source.split("DELETE FROM integrations")[1].split("RETURNING")[0]
    assert "NOT EXISTS" in delete
    assert "m.organization_id = i.organization_id" in delete
    assert "m.user_id = i.user_id" in delete
    assert "m.org_role <> 'viewer'" in delete


def test_logs_a_disconnect_for_every_deleted_row(source: str) -> None:
    assert "INSERT INTO auth_events" in source
    assert "FROM gone" in source
    assert "'oauth.disconnect'" in source
