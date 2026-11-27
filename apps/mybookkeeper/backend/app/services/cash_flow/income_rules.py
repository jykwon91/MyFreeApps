"""Which payments in count as income. Pure.

The repository already leaves out transfers, card payments and anything on a
loan or mortgage account. What's left out here needs the account holder's
name: money arriving under your own name ("Cash App Pat Doe") is your money
coming back from another of your accounts or apps, not income — the same rule
that keeps money you send yourself out of spending. Only a row the bank calls
a transfer, or gives no category (a bank CSV), is judged on the name, so a
paycheck that prints your name is still pay.
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping

from app.core.plaid_category_constants import PFC_TRANSFER_PRIMARIES
from app.repositories.cash_flow.income_row import IncomeRow
from app.services.transactions.self_transfer import names_holder

_JUDGED_ON_NAME = frozenset({*PFC_TRANSFER_PRIMARIES, None})


def is_from_self(row: IncomeRow, holder_names: Mapping[uuid.UUID, str]) -> bool:
    if row.external_category not in _JUDGED_ON_NAME or row.account_user_id is None:
        return False
    return names_holder((row.description, row.vendor), holder_names.get(row.account_user_id))
