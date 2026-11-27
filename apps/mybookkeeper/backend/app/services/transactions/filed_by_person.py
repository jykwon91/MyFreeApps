"""Mark a row a person filed, so no payee rule ever refiles it."""
from datetime import datetime, timezone

from app.models.transactions.transaction import Transaction


def mark_filed_by_person(txn: Transaction) -> None:
    txn.filed_by_person_at = datetime.now(timezone.utc)
