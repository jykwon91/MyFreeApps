"""lease_template_placeholders: migrate legacy ``applicant.email`` / ``applicant.phone`` specs

The very first version of ``services/leases/default_source_map.py`` seeded
``TENANT EMAIL`` / ``TENANT PHONE`` placeholders with ``applicant.email`` and
``applicant.phone`` — paths that never resolved (the applicant model had no
such columns at the time, and the resolver allowlist did not include them).

That value was later changed in code to ``inquiry.inquirer_email`` /
``inquiry.inquirer_phone``, and then again (in PR #377) to the
``applicant.contact_email || inquiry.inquirer_email`` fallback chain.
PR #377's migration only rewrote rows that matched the second of those three
historical values, so templates uploaded under the original seed are still
stuck with the legacy invalid spec — the resolver returns ``None`` and the
generate-lease form shows an empty TENANT EMAIL / TENANT PHONE input.

This migration covers the remaining legacy rows.

Revision ID: legtenp260507
Revises: tenpcontact260506
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "legtenp260507"
down_revision: Union[str, None] = "tenpcontact260506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'applicant.contact_email || inquiry.inquirer_email'
        WHERE key IN ('TENANT EMAIL', 'TENANT_EMAIL')
          AND default_source = 'applicant.email'
        """,
    )
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'applicant.contact_phone || inquiry.inquirer_phone'
        WHERE key IN ('TENANT PHONE', 'TENANT_PHONE')
          AND default_source = 'applicant.phone'
        """,
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'applicant.email'
        WHERE key IN ('TENANT EMAIL', 'TENANT_EMAIL')
          AND default_source = 'applicant.contact_email || inquiry.inquirer_email'
        """,
    )
    op.execute(
        """
        UPDATE lease_template_placeholders
        SET default_source = 'applicant.phone'
        WHERE key IN ('TENANT PHONE', 'TENANT_PHONE')
          AND default_source = 'applicant.contact_phone || inquiry.inquirer_phone'
        """,
    )
