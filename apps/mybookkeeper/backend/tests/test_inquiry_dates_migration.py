"""Lock the shape of the migration that folds the public form's dates into the desired dates.

The default suite builds its schema with ``create_all`` from the model, so the
migration itself runs only on deploy. Checked by hand on Postgres 18 with four
inquiries: form dates only (copied across), operator dates that differ from the
form (operator's kept, form's appended to notes), an email inquiry with no form
dates (untouched), and one where only the end date clashes (start filled from
the form, form dates in notes). Downgrade and re-upgrade gave the same rows.
"""
from __future__ import annotations

from pathlib import Path

import pytest

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "inqdates261107_fold_inquiry_move_dates_into_desired_dates.py"
)


@pytest.fixture(scope="module")
def upgrade() -> str:
    source = MIGRATION_FILE.read_text(encoding="utf-8")
    assert 'down_revision: Union[str, None] = "sysevtypes261107"' in source
    return source.split("def upgrade()")[1].split("def downgrade()")[0]


def test_keeps_clashing_form_dates_in_notes_before_folding(upgrade: str) -> None:
    assert upgrade.index("SET notes") < upgrade.index("SET desired_start_date")


def test_an_operator_date_wins_over_the_form_date(upgrade: str) -> None:
    assert "coalesce(desired_start_date, move_in_date)" in upgrade
    assert "coalesce(desired_end_date, move_out_date)" in upgrade


def test_drops_the_columns_only_after_folding(upgrade: str) -> None:
    assert upgrade.index("SET desired_start_date") < upgrade.index('drop_column("inquiries", "move_in_date")')
    assert "DELETE FROM" not in upgrade.upper()
