"""Which payments in count as income. Pure.

The repository already leaves out transfers, card payments and anything on a
loan or mortgage account. What's left out here needs the account holder's
name: money arriving under your own name ("Cash App Pat Doe PPD", or a card
descriptor like "CASH APP*PAT DOE*CA OAKLAND CA") is your money coming back
from another of your accounts or apps, not income — the same rule that keeps
money you send yourself out of spending. Pay that prints your name (the bank
calls it income, or a payroll company sent it) is still income.
"""
from __future__ import annotations

import re
import uuid
from collections.abc import Mapping

from app.core.personal_finance_constants import PAYROLL_WORDS
from app.core.plaid_category_constants import PFC_INCOME
from app.repositories.cash_flow.income_row import IncomeRow
from app.services.transactions.self_transfer import names_holder

_WORD = re.compile(r"[a-z0-9]+")


def _is_pay(row: IncomeRow) -> bool:
    if row.external_category == PFC_INCOME:
        return True
    words = set(_WORD.findall(f"{row.vendor or ''} {row.description or ''}".casefold()))
    return bool(words & PAYROLL_WORDS)


def is_from_self(row: IncomeRow, holder_names: Mapping[uuid.UUID, str]) -> bool:
    if row.account_user_id is None or _is_pay(row):
        return False
    return names_holder((row.description, row.vendor), holder_names.get(row.account_user_id))
