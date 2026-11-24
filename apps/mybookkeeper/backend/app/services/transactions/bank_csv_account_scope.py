"""Dedupe keys for a bank CSV imported into a specific account.

A CSV row's key is its date, amount and description. That is unique within one
account's statement, but not across accounts: the same "MONTHLY SERVICE FEE"
for the same amount on the same day can appear on two checking accounts, and
the second would be thrown away as a duplicate of the first. Prefixing the
account id keeps the two apart.

The unprefixed key is still checked, so re-importing a statement that was
first imported before it had an account does not import it a second time.
"""
from __future__ import annotations

import uuid


def scoped_external_id(account_id: uuid.UUID, external_id: str) -> str:
    return f"{account_id}:{external_id}"


def dedupe_keys(account_id: uuid.UUID | None, external_id: str) -> tuple[str, ...]:
    """Every stored key that means this row was already imported."""
    if account_id is None:
        return (external_id,)
    return (scoped_external_id(account_id, external_id), external_id)
