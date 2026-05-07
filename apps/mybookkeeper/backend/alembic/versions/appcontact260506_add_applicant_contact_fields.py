"""applicants: add contact_email + contact_phone with backfill from inquiries

Persists applicant/tenant contact info (email + phone) so it survives the
inquiry → applicant → tenant lifecycle. Previously the promote_service
had nowhere to put inquiry.inquirer_email / inquirer_phone — those
fields were silently lost on conversion.

Backfill copies ciphertext byte-for-byte from inquiries.inquirer_email /
inquirer_phone via the applicant's inquiry_id FK. Safe because both
source + destination columns use the same ``EncryptedString`` codec
(same Fernet key family — HKDF info=``mybookkeeper-pii-encryption`` —
no per-column salt or AAD), so the destination decrypts correctly via
the same TypeDecorator.

Column names are ``contact_email`` / ``contact_phone`` (not bare
``email`` / ``phone``) to avoid colliding with the audit-mask global
field-name match — ``users.email`` is intentionally plaintext and must
not be masked in audit_logs.

Revision ID: appcontact260506
Revises: inqregion260506
Create Date: 2026-05-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "appcontact260506"
down_revision: Union[str, None] = "inqregion260506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the new PII columns. Nullable additive change — no constraint
    # churn, non-blocking ALTER on Postgres for an empty/small table.
    # Underlying column type is unbounded String (Postgres TEXT) — the
    # length we pass to EncryptedString is documentary on the Python
    # side; the Fernet ciphertext is significantly longer than the
    # plaintext anyway.
    op.add_column(
        "applicants",
        sa.Column("contact_email", sa.String(), nullable=True),
    )
    op.add_column(
        "applicants",
        sa.Column("contact_phone", sa.String(), nullable=True),
    )

    # Backfill: copy ciphertext from each applicant's linked inquiry.
    # Both columns are encrypted under the same MBK PII key family
    # (HKDF info=``mybookkeeper-pii-encryption``), so byte-for-byte
    # ciphertext copy decrypts correctly through the same
    # ``EncryptedString`` TypeDecorator on read. No app-level
    # encrypt/decrypt roundtrip needed.
    op.execute(
        """
        UPDATE applicants
        SET contact_email = i.inquirer_email,
            contact_phone = i.inquirer_phone
        FROM inquiries i
        WHERE applicants.inquiry_id = i.id
          AND applicants.inquiry_id IS NOT NULL
        """,
    )


def downgrade() -> None:
    op.drop_column("applicants", "contact_phone")
    op.drop_column("applicants", "contact_email")
