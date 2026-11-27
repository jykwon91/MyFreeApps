"""Where a payment in came from: pay, rent, a one-off or something else. Pure.

- **Rent** — scoped to the rentals, filed as rental revenue, or from a payer
  who has paid rent before (a property manager's deposits sometimes land
  scoped personal, but they're still rent).
- **Pay** — from a payroll company, or from an employer that issued a W-2.
- **One-off** — anything else of at least ``ONE_OFF_MIN_CENTS`` from a payer
  seen in no other month.
- **Other** — the rest.
"""
from __future__ import annotations

import datetime as _dt
import re
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence

from app.core.cents import to_cents
from app.core.month_text import month_start
from app.core.payee_keys import payee_key, payee_name
from app.core.personal_finance_constants import (
    EMPLOYER_NAME_FILLER_WORDS,
    INCOME_KIND_ONE_OFF,
    INCOME_KIND_OTHER,
    INCOME_KIND_RENTAL,
    INCOME_KIND_SALARY,
    ONE_OFF_MIN_CENTS,
    PAYROLL_WORDS,
)
from app.core.spending_category_enums import TRANSACTION_SCOPE_RENTAL
from app.core.tags import RENTAL_ROI_REVENUE_TAGS
from app.repositories.cash_flow.income_row import IncomeRow
from app.services.personal_finances.income_context import IncomeContext

_WORD = re.compile(r"[a-z0-9]+")


def _words(text: str) -> frozenset[str]:
    return frozenset(_WORD.findall(text.casefold()))


def employer_words(issuer_names: Iterable[str]) -> tuple[frozenset[str], ...]:
    """Each employer's name as the words a payee must carry; a name of only
    filler words ("The Co") is dropped, as it would match anyone."""
    employers = (_words(name) - EMPLOYER_NAME_FILLER_WORDS for name in issuer_names)
    return tuple(words for words in employers if words)


def _is_rent(row: IncomeRow) -> bool:
    return row.transaction_scope == TRANSACTION_SCOPE_RENTAL or row.category in RENTAL_ROI_REVENUE_TAGS


def rental_payers(history: Iterable[IncomeRow]) -> frozenset[str]:
    """The payee keys of everyone who has paid rent."""
    keys = (payee_key(row.vendor, row.description) for row in history if _is_rent(row))
    return frozenset(key for key in keys if key is not None)


def _regular_kind(
    row: IncomeRow, *, employers: Sequence[frozenset[str]], rental_payers: frozenset[str],
) -> str | None:
    """Rent or pay, or None for neither."""
    if _is_rent(row) or payee_key(row.vendor, row.description) in rental_payers:
        return INCOME_KIND_RENTAL
    words = _words(payee_name(row.vendor, row.description))
    if words & PAYROLL_WORDS or any(employer <= words for employer in employers):
        return INCOME_KIND_SALARY
    return None


def income_context(history: Sequence[IncomeRow], issuer_names: Iterable[str]) -> IncomeContext:
    """What ``income_kind`` needs. Pass all of the bank history, not just the
    range shown, so a payer who pays every year isn't a one-off in a one-year
    range and a property manager known from last year is still known."""
    employers = employer_words(issuer_names)
    payers = rental_payers(history)
    months_by_payer: dict[str, set[_dt.date]] = defaultdict(set)
    for row in history:
        key = payee_key(row.vendor, row.description)
        if key is not None:
            months_by_payer[key].add(month_start(row.transaction_date))
    one_offs: set[uuid.UUID] = set()
    for row in history:
        if _regular_kind(row, employers=employers, rental_payers=payers) is not None:
            continue
        if to_cents(row.amount) < ONE_OFF_MIN_CENTS:
            continue
        key = payee_key(row.vendor, row.description)
        if key is None or len(months_by_payer[key]) == 1:
            one_offs.add(row.id)
    return IncomeContext(employers=employers, rental_payers=payers, one_offs=frozenset(one_offs))


def income_kind(row: IncomeRow, context: IncomeContext) -> str:
    regular = _regular_kind(row, employers=context.employers, rental_payers=context.rental_payers)
    if regular is not None:
        return regular
    return INCOME_KIND_ONE_OFF if row.id in context.one_offs else INCOME_KIND_OTHER
