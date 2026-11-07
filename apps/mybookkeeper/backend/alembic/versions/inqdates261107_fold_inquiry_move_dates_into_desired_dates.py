"""Fold the public form's move-in / move-out dates into the desired dates.

Public-form inquiries stored the applicant's dates in ``move_in_date`` /
``move_out_date`` while every other inquiry, the inbox card and the quality
score used ``desired_start_date`` / ``desired_end_date``, so public-form
inquiries showed no dates in the inbox. One pair now holds the fact.

A date the operator already entered wins. Where the applicant's form date
differs from it, the form date is kept in the inquiry's notes, not dropped.

Revision ID: inqdates261107
Revises: sysevtypes261107
Create Date: 2026-11-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "inqdates261107"
down_revision: Union[str, None] = "sysevtypes261107"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE inquiries
        SET notes = concat_ws(
            E'\\n\\n', notes,
            'Dates on the applicant''s form: '
            || coalesce(move_in_date::text, '?') || ' to ' || coalesce(move_out_date::text, '?')
        )
        WHERE (desired_start_date IS NOT NULL AND move_in_date IS NOT NULL
               AND desired_start_date <> move_in_date)
           OR (desired_end_date IS NOT NULL AND move_out_date IS NOT NULL
               AND desired_end_date <> move_out_date)
        """
    )
    op.execute(
        """
        UPDATE inquiries
        SET desired_start_date = coalesce(desired_start_date, move_in_date),
            desired_end_date = coalesce(desired_end_date, move_out_date)
        WHERE move_in_date IS NOT NULL OR move_out_date IS NOT NULL
        """
    )
    op.drop_column("inquiries", "move_in_date")
    op.drop_column("inquiries", "move_out_date")


def downgrade() -> None:
    op.add_column("inquiries", sa.Column("move_in_date", sa.Date(), nullable=True))
    op.add_column("inquiries", sa.Column("move_out_date", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE inquiries
        SET move_in_date = desired_start_date, move_out_date = desired_end_date
        WHERE submitted_via = 'public_form'
        """
    )
