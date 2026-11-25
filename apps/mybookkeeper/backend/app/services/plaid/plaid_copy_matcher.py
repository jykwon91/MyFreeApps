"""Is a synced bank row the same money as a row already on file from an email
or a document? Pure.

The caller has already narrowed candidates to live rows in the same org with
the same amount and direction, on no account or the same account, and not
linked to any source id. What is left to decide here:

* **Person-to-person** (the bank description names a payer, e.g. ``Zelle
  payment from SONU KING 317…``): dated within
  ``PLAID_COPY_MATCH_WINDOW_DAYS_P2P`` days and the row on file names the same
  payer. Two different people paying the same amount days apart never match.
* **Anything else**: dated within ``PLAID_COPY_MATCH_WINDOW_DAYS_OTHER`` days
  and the row's vendor and the bank's name contain one another. A vendor that
  is only a payment rail (``Zelle``) says nothing about the payee and never
  matches. The same bill a month later is outside the window.

Only a match that is the one candidate either way is acted on; anything
ambiguous is left for the duplicate review.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections import Counter
from collections.abc import Iterable, Sequence

from app.core.plaid_constants import (
    PLAID_COPY_MATCH_WINDOW_DAYS_OTHER,
    PLAID_COPY_MATCH_WINDOW_DAYS_P2P,
    PLAID_COPY_MIN_VENDOR_LENGTH,
    PLAID_COPY_P2P_RAILS,
)
from app.models.transactions.transaction import Transaction
from app.services.transactions.bank_payer_name_parser import parse_payer_name


def _compact(value: str | None) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def _bank_payer(bank_texts: Sequence[str | None]) -> str | None:
    for text in bank_texts:
        payer = parse_payer_name(text)
        if payer:
            return payer
    return None


def _same_payer(bank_payer: str, candidate: Transaction) -> bool:
    on_file = candidate.payer_name or parse_payer_name(candidate.description)
    return on_file is not None and " ".join(on_file.lower().split()) == bank_payer.lower()


def _same_vendor(bank_texts: Sequence[str | None], candidate: Transaction) -> bool:
    vendor = _compact(candidate.vendor)
    if len(vendor) < PLAID_COPY_MIN_VENDOR_LENGTH or vendor in PLAID_COPY_P2P_RAILS:
        return False
    for text in (_compact(t) for t in bank_texts):
        if not text or text in PLAID_COPY_P2P_RAILS:
            continue
        if vendor in text or (len(text) >= PLAID_COPY_MIN_VENDOR_LENGTH and text in vendor):
            return True
    return False


def is_same_money(
    *, bank_date: _dt.date, bank_texts: Sequence[str | None], candidate: Transaction,
) -> bool:
    days_apart = abs((candidate.transaction_date - bank_date).days)
    bank_payer = _bank_payer(bank_texts)
    if bank_payer is not None:
        return days_apart <= PLAID_COPY_MATCH_WINDOW_DAYS_P2P and _same_payer(bank_payer, candidate)
    return days_apart <= PLAID_COPY_MATCH_WINDOW_DAYS_OTHER and _same_vendor(bank_texts, candidate)


def only_copy(
    *, bank_date: _dt.date, bank_texts: Sequence[str | None], candidates: Iterable[Transaction],
) -> Transaction | None:
    """The one row on file that is this money, or ``None`` when there is none
    or more than one."""
    matches = [
        c for c in candidates
        if is_same_money(bank_date=bank_date, bank_texts=bank_texts, candidate=c)
    ]
    return matches[0] if len(matches) == 1 else None


def unambiguous_pairs(
    pairs: Iterable[tuple[Transaction, Transaction]],
) -> list[tuple[Transaction, Transaction]]:
    """``(synced row, row on file)`` pairs that are the same money, keeping only
    those where each row matches nothing else. A pair the person already
    marked "not duplicates" (both rows reviewed) is never merged."""
    matched = [
        (synced, on_file) for synced, on_file in pairs
        if not (synced.duplicate_reviewed_at and on_file.duplicate_reviewed_at)
        and is_same_money(
            bank_date=synced.transaction_date,
            bank_texts=(synced.vendor, synced.description),
            candidate=on_file,
        )
    ]
    synced_counts: Counter[uuid.UUID] = Counter(s.id for s, _ in matched)
    on_file_counts: Counter[uuid.UUID] = Counter(f.id for _, f in matched)
    return [
        (s, f) for s, f in matched
        if synced_counts[s.id] == 1 and on_file_counts[f.id] == 1
    ]
