"""The rows that count towards any money figure.

Live (not soft-deleted), approved — which also leaves out rows marked as
duplicates, and the ones still waiting to be reviewed — and not a transfer:
moving money between your own accounts is neither earned nor spent.
"""
import uuid

from sqlalchemy import ColumnElement

from app.core.tags import TRANSACTION_TYPE_TRANSFER
from app.core.transaction_statuses import COUNTED_STATUS
from app.models.transactions.transaction import Transaction


def counted_transaction_filters(organization_id: uuid.UUID) -> list[ColumnElement[bool]]:
    return [
        Transaction.organization_id == organization_id,
        Transaction.deleted_at.is_(None),
        Transaction.status == COUNTED_STATUS,
        Transaction.transaction_type != TRANSACTION_TYPE_TRANSFER,
    ]
