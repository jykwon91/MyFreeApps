"""Lock the Plaid-removal migration's shape so it cannot regress.

The migration ``rmplaid260511_remove_plaid_integration`` is the
operational migration that completes the Plaid integration removal
(feature/jkwon91/mbk-remove-plaid, 2026-05-11). If a future edit ever
weakens the migration — e.g. drops only one of the two Plaid tables,
forgets to clear the integrations rows, or accidentally widens the
DELETE to non-Plaid providers — these assertions catch it before merge.

Live-DB round-trip is intentionally NOT covered here: the default
pytest suite runs against SQLite which can't reproduce the Postgres
FK + ondelete semantics, and the structural assertions below are
sufficient to lock the contract. The live upgrade is exercised by the
deploy workflow on the next deploy.
"""
from __future__ import annotations

from pathlib import Path

import pytest


MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "rmplaid260511_remove_plaid_integration.py"
)


@pytest.fixture(scope="module")
def migration_source() -> str:
    assert MIGRATION_FILE.exists(), (
        f"Plaid-removal migration missing at {MIGRATION_FILE}. The PR that "
        "removes Plaid MUST include this migration — every prior MBK "
        "release shipped with the plaid_items/plaid_accounts tables."
    )
    return MIGRATION_FILE.read_text(encoding="utf-8")


def test_chains_after_dropce260510(migration_source: str) -> None:
    """The migration must extend the chain from the prior head."""
    assert 'down_revision: Union[str, None] = "dropce260510"' in migration_source, (
        "rmplaid260511 must chain after dropce260510 (the head as of the "
        "feature branch start). If a newer head landed first, rebase the "
        "down_revision pointer; do not branch the DAG."
    )


def test_drops_both_plaid_tables(migration_source: str) -> None:
    """Both child + parent tables must be dropped — partial removal leaves
    orphan rows in plaid_accounts pointing at a deleted plaid_items.
    """
    assert 'op.drop_table("plaid_accounts")' in migration_source, (
        "Migration must drop plaid_accounts (child table — FK references "
        "plaid_items)."
    )
    assert 'op.drop_table("plaid_items")' in migration_source, (
        "Migration must drop plaid_items (parent table)."
    )
    # Order matters: child before parent.
    accounts_idx = migration_source.index('op.drop_table("plaid_accounts")')
    items_idx = migration_source.index('op.drop_table("plaid_items")')
    assert accounts_idx < items_idx, (
        "plaid_accounts must be dropped BEFORE plaid_items — Postgres "
        "won't drop a referenced table while child rows still exist."
    )


def test_clears_plaid_integration_rows(migration_source: str) -> None:
    """Any leftover ``integrations.provider='plaid'`` rows must be deleted
    so the shared integrations table stops carrying inert Plaid state.
    """
    assert "DELETE FROM integrations WHERE provider = 'plaid'" in migration_source, (
        "Migration must clear integrations rows with provider='plaid' so "
        "the table contains only active providers (gmail, future)."
    )


def test_does_not_touch_non_plaid_data(migration_source: str) -> None:
    """The migration must NOT touch Gmail rows, audit_events, or
    transactions — those are preserved per the PR contract.
    """
    forbidden_substrings = [
        "DELETE FROM integrations WHERE provider = 'gmail'",
        "DELETE FROM integrations\n",  # bare unconditional delete
        "drop_table(\"integrations\"",
        "drop_table(\"auth_events\"",
        "drop_table(\"audit_logs\"",
        "drop_table(\"transactions\"",
    ]
    for forbidden in forbidden_substrings:
        assert forbidden not in migration_source, (
            f"Migration must not contain '{forbidden}' — Plaid removal "
            "preserves all non-Plaid integration data, history, and "
            "transaction rows."
        )


def test_downgrade_is_explicit_no_op(migration_source: str) -> None:
    """The migration is documented as irreversible; the downgrade body
    must be a ``pass`` stub — never a half-restored schema that would
    silently corrupt a rollback.
    """
    # Find the downgrade body.
    lines = migration_source.splitlines()
    in_downgrade = False
    downgrade_body: list[str] = []
    for line in lines:
        if line.startswith("def downgrade("):
            in_downgrade = True
            continue
        if in_downgrade:
            if line and not line.startswith((" ", "\t", "#")):
                break  # next top-level def
            downgrade_body.append(line)
    # Strip pure-comment and blank lines.
    code_lines = [
        ln.strip() for ln in downgrade_body
        if ln.strip() and not ln.strip().startswith("#")
    ]
    assert code_lines == ["pass"], (
        f"downgrade() must be exactly `pass` (irreversible by design). "
        f"Got: {code_lines}"
    )
