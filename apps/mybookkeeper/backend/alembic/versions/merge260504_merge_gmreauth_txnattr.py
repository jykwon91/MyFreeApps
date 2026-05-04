"""Merge gmreauth260504 + txnattr260504 heads.

PR #212 (Gmail token expiry detection) and PR #213 (rent attribution) were
developed on separate worktrees from the same base (calttp260503). Their
migrations branched. This merge migration joins the two linear chains so
subsequent migrations (rcpt260504 rent receipts) have a single parent.

No DDL is performed — this is a pure bookkeeping merge.

Revision ID: merge260504
Revises: gmreauth260504, txnattr260504
Create Date: 2026-05-04 00:00:00.000000
"""
from typing import Sequence, Union

revision: str = "merge260504"
down_revision: Union[str, tuple[str, ...], None] = ("gmreauth260504", "txnattr260504")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
