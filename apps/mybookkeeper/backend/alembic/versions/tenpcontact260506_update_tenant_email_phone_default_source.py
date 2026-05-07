"""lease_template_placeholders: add applicant fallback to TENANT EMAIL/PHONE default_source

Existing placeholder rows for ``TENANT EMAIL`` / ``TENANT PHONE`` were seeded
with ``inquiry.inquirer_email`` / ``inquiry.inquirer_phone`` because at the
time the applicant model had no contact fields. The applicant now has
``contact_email`` and ``contact_phone`` (added in ``appcontact260506``), so
the resolver should prefer the applicant value with the inquiry as fallback.

This migration only updates rows that still hold the legacy single-source
spec; rows a host has customized are left alone.

Revision ID: tenpcontact260506
Revises: appcontact260506
Create Date: 2026-05-06 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "tenpcontact260506"
down_revision: Union[str, None] = "appcontact260506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'applicant.contact_email || inquiry.inquirer_email'
        WHERE key IN ('TENANT EMAIL', 'TENANT_EMAIL')
          AND default_source = 'inquiry.inquirer_email'
        """,
    )
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'applicant.contact_phone || inquiry.inquirer_phone'
        WHERE key IN ('TENANT PHONE', 'TENANT_PHONE')
          AND default_source = 'inquiry.inquirer_phone'
        """,
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'inquiry.inquirer_email'
        WHERE key IN ('TENANT EMAIL', 'TENANT_EMAIL')
          AND default_source = 'applicant.contact_email || inquiry.inquirer_email'
        """,
    )
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'inquiry.inquirer_phone'
        WHERE key IN ('TENANT PHONE', 'TENANT_PHONE')
          AND default_source = 'applicant.contact_phone || inquiry.inquirer_phone'
        """,
    )
