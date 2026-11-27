"""Money you sent to yourself: when a row out of one account and a row into
another are one transfer. Pure.

Two banks rarely show a transfer between them at the same amount. A service
like Wise keeps a small fee on the way, so $680.00 leaves Wise and $678.87
reaches Chase. Exact-amount legs are paired when they are synced
(``plaid_transaction_applier``); these are the ones that differ, and they are
paired only when every sign agrees:

  * the row out names the account holder ("Jason Kwon (Sent)");
  * the row in names the holder too, or the bank the money left
    ("... Via WISE");
  * both rows are on the same person's accounts, two different ones;
  * the bank called them a transfer, or gave no category (a bank CSV);
  * they are dated within a few days of each other;
  * what arrived is what was sent less at most a fee (``SELF_TRANSFER_MAX_FEE``
    and ``SELF_TRANSFER_MAX_FEE_SHARE``) — never more than was sent;
  * each has one such counterpart, and only one: two candidates are never
    guessed between.
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence
from decimal import Decimal

from app.core.monthly_expense_constants import PFC_TRANSFER_OUT
from app.core.plaid_category_constants import PFC_TRANSFER_PRIMARIES
from app.core.plaid_constants import PLAID_TRANSFER_MATCH_WINDOW_DAYS
from app.core.self_transfer_constants import (
    SELF_TRANSFER_MAX_FEE,
    SELF_TRANSFER_MAX_FEE_SHARE,
    SELF_TRANSFER_MIN_NAME_WORDS,
)
from app.repositories.transactions.transfer_leg import TransferLeg

_SENT_CATEGORIES = frozenset({PFC_TRANSFER_OUT, None})
_RECEIVED_CATEGORIES = frozenset({*PFC_TRANSFER_PRIMARIES, None})


def _words(text: str) -> str:
    return " ".join(text.casefold().split())


def _names(texts: Iterable[str | None], name: str) -> bool:
    wanted = _words(name)
    return bool(wanted) and any(wanted in _words(text) for text in texts if text)


def names_holder(texts: Iterable[str | None], holder_name: str | None) -> bool:
    """Whether one of ``texts`` names the holder. A one-word name never counts:
    "Jason" alone would also match "Jason's Deli"."""
    if holder_name is None or len(holder_name.split()) < SELF_TRANSFER_MIN_NAME_WORDS:
        return False
    return _names(texts, holder_name)


def is_fee_sized(sent: Decimal, received: Decimal) -> bool:
    """Whether ``received`` is ``sent`` less no more than a transfer fee."""
    fee = sent - received
    return Decimal(0) <= fee <= min(SELF_TRANSFER_MAX_FEE, sent * SELF_TRANSFER_MAX_FEE_SHARE)


def is_pair(sent: TransferLeg, received: TransferLeg) -> bool:
    """Whether ``sent`` (money out) and ``received`` (money in) are one
    transfer between the holder's own accounts."""
    received_texts = (received.description, received.vendor)
    return (
        sent.account_id != received.account_id
        and sent.account_user_id == received.account_user_id
        and sent.external_category in _SENT_CATEGORIES
        and received.external_category in _RECEIVED_CATEGORIES
        and abs((received.transaction_date - sent.transaction_date).days) <= PLAID_TRANSFER_MATCH_WINDOW_DAYS
        and is_fee_sized(sent.amount, received.amount)
        and names_holder((sent.description, sent.vendor), sent.holder_name)
        and (
            names_holder(received_texts, sent.holder_name)
            or (sent.account_institution is not None and _names(received_texts, sent.account_institution))
        )
    )


def unambiguous_pairs(
    sent: Sequence[TransferLeg], received: Sequence[TransferLeg],
) -> list[tuple[TransferLeg, TransferLeg]]:
    """Every (sent, received) pair where each has exactly one counterpart."""
    matches = [(out, [into for into in received if is_pair(out, into)]) for out in sent]
    senders_of = Counter(into.id for _, candidates in matches for into in candidates)
    return [
        (out, candidates[0])
        for out, candidates in matches
        if len(candidates) == 1 and senders_of[candidates[0].id] == 1
    ]
