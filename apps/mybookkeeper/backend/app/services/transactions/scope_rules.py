"""What a transaction's scope forces onto it.

Personal spending is tracked, never taxed: a personal row can never reach a
tax form or a depreciation schedule, so its tax fields are forced off rather
than rejected — a rental expense re-scoped to personal in the editor still
carries its Schedule E line, and making the user clear it first would only be
friction. A spending category only means something on a personal row, so it
is dropped from rental and business rows. ``chk_txn_personal_not_tax`` and
``chk_txn_spending_category_personal`` hold the same rules in the database.

Pure: takes the row's would-be values, returns the overrides to apply.
"""
from __future__ import annotations

import uuid

from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL

ScopeOverrides = dict[str, bool | str | uuid.UUID | None]


def scope_overrides(
    *,
    transaction_scope: str,
    spending_category_id: uuid.UUID | None,
) -> ScopeOverrides:
    if transaction_scope != TRANSACTION_SCOPE_PERSONAL:
        return {"spending_category_id": None} if spending_category_id is not None else {}
    return {
        "tax_relevant": False,
        "schedule_e_line": None,
        "is_capital_improvement": False,
        "placed_in_service_date": None,
    }
