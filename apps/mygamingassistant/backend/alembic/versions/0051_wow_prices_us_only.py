"""WoW Forever auction-house prices are US only

Revision ID: 0051
Revises: 0050
Create Date: 2026-11-08 00:00:00.000000

WHY. The operator decided prices should only ever be US prices. The refresh
now pulls and the API serves the US feed alone, so the eu / kr / tw feeds are
dead rows. This deletes them (their ``wow_item_price`` rows go first; the FK
also cascades) and narrows ``ck_wowpricefeed_region`` to ``('us')`` so a
non-US feed can't come back.

Downgrade widens the CHECK again; the deleted prices are not restored (the
refresh refetches whatever regions the code asks for).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0051"
down_revision: Union[str, None] = "0050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of app/core/wow_prices.py's region list, as SQL.
_US_ONLY = "('us')"
_ALL_REGIONS = "('us', 'eu', 'kr', 'tw')"
_CHECK = "ck_wowpricefeed_region"


def upgrade() -> None:
    op.execute(
        "DELETE FROM wow_item_price WHERE feed_id IN "
        "(SELECT id FROM wow_price_feed WHERE region <> 'us')"
    )
    op.execute("DELETE FROM wow_price_feed WHERE region <> 'us'")
    op.drop_constraint(_CHECK, "wow_price_feed", type_="check")
    op.create_check_constraint(_CHECK, "wow_price_feed", f"region IN {_US_ONLY}")


def downgrade() -> None:
    op.drop_constraint(_CHECK, "wow_price_feed", type_="check")
    op.create_check_constraint(_CHECK, "wow_price_feed", f"region IN {_ALL_REGIONS}")
