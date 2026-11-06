"""Lock the shape of the migration that keys integrations by org, not user.

The default suite builds its schema with ``create_all`` from the model, so the
migration itself runs only on deploy. Checked by hand on Postgres 18: clashing
rows stop the upgrade (two rows for one org) and the downgrade (one user's rows
in two orgs) with a count and no rows deleted; with clean data both directions
work, and autogenerate shows no constraint or index drift.
"""
from __future__ import annotations

from pathlib import Path

import pytest

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "intgorgkey261106_integration_unique_per_org.py"
)


@pytest.fixture(scope="module")
def source() -> str:
    return MIGRATION_FILE.read_text(encoding="utf-8")


def test_chains_after_the_send_claim_account_migration(source: str) -> None:
    assert 'down_revision: Union[str, None] = "sendclaimacct261106"' in source


def test_checks_for_clashing_rows_before_each_new_key(source: str) -> None:
    upgrade = source.split("def upgrade()")[1].split("def downgrade()")[0]
    downgrade = source.split("def downgrade()")[1]
    assert upgrade.index('_refuse_if_duplicated("organization_id"') < upgrade.index("create_unique_constraint")
    assert downgrade.index('_refuse_if_duplicated("user_id"') < downgrade.index("create_unique_constraint")


def test_never_deletes_rows_to_fit_a_key(source: str) -> None:
    assert "DELETE FROM" not in source.upper()
    assert "op.execute" not in source
