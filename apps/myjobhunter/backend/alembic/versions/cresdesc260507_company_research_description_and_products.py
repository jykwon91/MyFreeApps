"""Add description + products_for_you columns to company_research.

Two new fields on the AI Research panel:

- ``description`` — what the company does, products, business model.
  Synthesised from a Tavily search WITHOUT the review-site
  ``include_domains`` filter so the prompt context includes the
  company's own site, news, crunchbase, wikipedia.

- ``products_for_you`` — personalised: which products / teams / role
  families at the company align with the requesting user's resume
  background. Synthesised by passing the user's profile (summary +
  recent roles + top skills) into the Claude prompt.

Both columns are nullable Text. Default null on existing rows;
re-running research populates them.

Reversible: downgrade drops both columns. The data is fully
re-derivable from a fresh research run.

Revision ID: cresdesc260507
Revises: srcdedup260507
Create Date: 2026-05-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "cresdesc260507"
down_revision: Union[str, None] = "srcdedup260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "company_research",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "company_research",
        sa.Column("products_for_you", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("company_research", "products_for_you")
    op.drop_column("company_research", "description")
