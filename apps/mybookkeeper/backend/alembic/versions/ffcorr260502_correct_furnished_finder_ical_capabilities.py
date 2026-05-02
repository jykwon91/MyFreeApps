"""correct furnished finder ical capabilities

Furnished Finder does not expose an iCal export, and only supports iCal
import from Airbnb / VRBO (verified 2026-05-02 via FF support docs:
support.furnishedfinder.com/hc/en-us/articles/35107733754779). The PR 1.4
seed migration set both flags to True for the ``furnished_finder`` row;
this migration corrects them to False so the UI can stop pretending an
iCal feed is reachable.

Existing ``channel_listings`` rows that point to furnished_finder with a
non-null ``ical_import_url`` are left as-is — that URL is operator-entered
and the column doesn't get cleared, but the polling worker already skips
provider-incompatible feeds so no follow-up cleanup is required.

Revision ID: ffcorr260502
Revises: ffmerge260502
Create Date: 2026-05-02 00:00:00.000000

"""
from typing import Union

from alembic import op


revision: str = "ffcorr260502"
down_revision: Union[str, None] = "ffmerge260502"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE channels
           SET supports_ical_export = false,
               supports_ical_import = false
         WHERE id = 'furnished_finder'
        """,
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE channels
           SET supports_ical_export = true,
               supports_ical_import = true
         WHERE id = 'furnished_finder'
        """,
    )
