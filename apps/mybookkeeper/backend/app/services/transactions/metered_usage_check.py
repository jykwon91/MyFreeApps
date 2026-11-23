"""Reject an edit that leaves a transaction's metered-usage columns inconsistent.

The schema can only judge the fields in one PATCH body. A body that moves one
end of the service period is judged here against the end already on the row, so
the answer is a readable 422 rather than a CHECK-constraint error from the
database. Mirrors ``chk_txn_usage_paired``, ``chk_txn_service_period_paired``
and ``chk_txn_service_period_order``.
"""
from app.models.transactions.transaction import Transaction

USAGE_PAIR_MESSAGE = "Enter the usage amount and its unit together."
SERVICE_PERIOD_PAIR_MESSAGE = "Enter both the first and last day of the service period."
SERVICE_PERIOD_ORDER_MESSAGE = "The service period cannot end before it starts."


def assert_metered_usage_consistent(txn: Transaction) -> None:
    if (txn.usage_quantity is None) != (txn.usage_unit is None):
        raise ValueError(USAGE_PAIR_MESSAGE)
    if (txn.service_period_start is None) != (txn.service_period_end is None):
        raise ValueError(SERVICE_PERIOD_PAIR_MESSAGE)
    if (
        txn.service_period_start is not None
        and txn.service_period_end is not None
        and txn.service_period_end < txn.service_period_start
    ):
        raise ValueError(SERVICE_PERIOD_ORDER_MESSAGE)
