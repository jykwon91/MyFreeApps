"""Where a transaction's status changes when it may be a personal transfer.

Pure: these change a ``Transaction`` in memory and touch no database.

Marking a row a personal transfer is the person's decision, so nothing done to
the row later on its own (a second source reporting another amount, a
duplicate merge, a re-read of the document) may undo it. Writers other than
mark and unmark set the status through ``set_status``, which records the new
status as the one to restore instead of overwriting ``personal_transfer``.
"""
from app.core.transaction_statuses import (
    PERSONAL_TRANSFER_PRIOR_STATUSES,
    PERSONAL_TRANSFER_STATUS,
)
from app.models.transactions.transaction import Transaction


def is_personal_transfer(txn: Transaction) -> bool:
    return txn.status == PERSONAL_TRANSFER_STATUS


def set_status(txn: Transaction, status: str) -> None:
    """Set ``status``, or, on a personal transfer, the status un-marking restores."""
    if is_personal_transfer(txn):
        txn.status_before_personal_transfer = status
    else:
        txn.status = status


def assert_status_editable(txn: Transaction, new_status: object) -> None:
    """Refuse an ordinary edit into or out of a personal transfer.

    Marking remembers the sender and resolves the Payment Review card, and
    un-marking restores the earlier status, so both go through their own
    action rather than a plain status edit. Raises ``ValueError``.
    """
    if new_status == PERSONAL_TRANSFER_STATUS and not is_personal_transfer(txn):
        raise ValueError("Use \"Mark as personal transfer\" to mark this transaction")
    if is_personal_transfer(txn) and new_status != PERSONAL_TRANSFER_STATUS:
        raise ValueError("This is marked as a personal transfer. Use \"Not a personal transfer\" first")


def mark_personal_transfer(txn: Transaction) -> None:
    """Make ``txn`` a personal transfer, remembering its status. A no-op if it is one.

    Raises ``ValueError`` for a row whose status can't be marked (a deleted duplicate).
    """
    if is_personal_transfer(txn):
        return
    if txn.status not in PERSONAL_TRANSFER_PRIOR_STATUSES:
        raise ValueError("This transaction can't be marked as a personal transfer")
    txn.status_before_personal_transfer = txn.status
    txn.status = PERSONAL_TRANSFER_STATUS


def unmark_personal_transfer(txn: Transaction) -> None:
    """Put back the status ``txn`` had before it was marked.

    Raises ``ValueError`` when ``txn`` isn't a personal transfer.
    """
    if not is_personal_transfer(txn):
        raise ValueError("This transaction isn't marked as a personal transfer")
    txn.status = txn.status_before_personal_transfer or "pending"
    txn.status_before_personal_transfer = None


def carry_personal_transfer(old: Transaction, new: Transaction) -> None:
    """Keep a personal transfer marked when ``new`` replaces ``old``.

    ``new`` keeps its own status as the one to restore, since it is the better read.
    """
    if is_personal_transfer(old) and not is_personal_transfer(new):
        new.status_before_personal_transfer = new.status
        new.status = PERSONAL_TRANSFER_STATUS
