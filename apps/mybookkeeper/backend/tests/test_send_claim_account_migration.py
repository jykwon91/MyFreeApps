"""Lock the shape of the migration that records each send claim's Gmail account.

The default suite builds its schema with ``create_all``, so these CHECKs, which
live only in the migration, are never created there. Checked by hand on
Postgres 18: a legacy ``sending`` row survives the upgrade and can settle, a new
``sending`` claim without an address is refused.
"""
from __future__ import annotations

from pathlib import Path

import pytest

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "sendclaimacct261106_add_send_claim_gmail_address.py"
)


@pytest.fixture(scope="module")
def source() -> str:
    return MIGRATION_FILE.read_text(encoding="utf-8")


def test_chains_after_the_reply_claim_migration(source: str) -> None:
    assert 'down_revision: Union[str, None] = "inqreplyclaim261105"' in source


@pytest.mark.parametrize(
    ("table", "constraint"),
    [
        ("inquiry_reply_sends", "chk_inquiry_reply_send_sending_account"),
        ("pending_rent_receipts", "chk_pending_rent_receipt_sending_account"),
    ],
)
def test_sending_claims_need_an_address_without_rejecting_legacy_rows(
    source: str, table: str, constraint: str,
) -> None:
    assert (
        f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
        "\"\n        \"CHECK (status <> 'sending' OR sender_gmail_address IS NOT NULL) NOT VALID"
    ) in source


def test_encrypted_address_columns_are_unbounded(source: str) -> None:
    """Fernet ciphertext is longer than the address, so the columns can't be VARCHAR(255)."""
    assert 'sa.Column("gmail_address", sa.Text(), nullable=True)' in source
    assert 'sa.Column("sender_gmail_address", sa.Text(), nullable=True)' in source
    assert "String(" not in source
