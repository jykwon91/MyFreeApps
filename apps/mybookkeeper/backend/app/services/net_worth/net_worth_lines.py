"""What counts toward net worth today, and how history should treat each source.

Pure: no database, no I/O.

**No double counting.** A loan can be on the books twice: as a mortgage record
(Mortgages page) and as a mortgage account linked to it
(``financial_accounts.mortgage_id``). A record with a live account linked to
it is that account, so only the account counts — even once the account is
closed, since closing the account is the person saying the loan is done. A
record with no linked account counts on its own, from its statement balance.

Accounts count while open and not deleted. Properties count while active and
only with a value the person entered; one without is listed so they can add
it, never valued from its purchase price.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
import uuid

from app.core.financial_account_enums import (
    ASSET_ACCOUNT_TYPES,
    CLASSIFICATION_ASSET,
    CLASSIFICATION_LIABILITY,
)
from app.core.net_worth_constants import (
    GROUP_FOR_ACCOUNT_TYPE,
    GROUP_LOANS,
    GROUP_PROPERTY,
    NET_WORTH_CURRENCY,
    SOURCE_ACCOUNT,
    SOURCE_MORTGAGE,
    SOURCE_PROPERTY,
)
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.properties.property import Property
from app.services.net_worth.history_source import HistorySource
from app.services.net_worth.net_worth_line import NetWorthLine
from app.services.net_worth.snapshot_source_key import SnapshotSourceKey

MORTGAGE_FALLBACK_NAME = "Mortgage"


def key_of(line: NetWorthLine) -> SnapshotSourceKey:
    return SnapshotSourceKey(line.source, line.source_id)


def is_counted(line: NetWorthLine) -> bool:
    """In the total: it has a value, in the currency the total is in."""
    return line.amount_cents is not None and line.currency == NET_WORTH_CURRENCY


def _linked_mortgage_accounts(accounts: Iterable[FinancialAccount]) -> dict[uuid.UUID, uuid.UUID]:
    """Loan record id -> the live account that is that loan."""
    return {a.mortgage_id: a.id for a in accounts if a.mortgage_id is not None}


def _account_line(account: FinancialAccount) -> NetWorthLine:
    classification = (
        CLASSIFICATION_ASSET if account.account_type in ASSET_ACCOUNT_TYPES else CLASSIFICATION_LIABILITY
    )
    return NetWorthLine(
        source=SOURCE_ACCOUNT,
        source_id=account.id,
        name=account.name,
        detail=account.institution_name,
        group=GROUP_FOR_ACCOUNT_TYPE[account.account_type],
        classification=classification,
        currency=account.currency,
        amount_cents=account.current_balance_cents,
        as_of=account.balance_as_of,
    )


def _mortgage_line(mortgage: Mortgage, property_names: Mapping[uuid.UUID, str]) -> NetWorthLine:
    return NetWorthLine(
        source=SOURCE_MORTGAGE,
        source_id=mortgage.id,
        name=mortgage.lender or MORTGAGE_FALLBACK_NAME,
        detail=property_names.get(mortgage.property_id),
        group=GROUP_LOANS,
        classification=CLASSIFICATION_LIABILITY,
        currency=NET_WORTH_CURRENCY,
        amount_cents=mortgage.current_balance_cents,
        as_of=mortgage.statement_date,
    )


def _property_line(prop: Property) -> NetWorthLine:
    return NetWorthLine(
        source=SOURCE_PROPERTY,
        source_id=prop.id,
        name=prop.name,
        detail=prop.address,
        group=GROUP_PROPERTY,
        classification=CLASSIFICATION_ASSET,
        currency=NET_WORTH_CURRENCY,
        amount_cents=prop.estimated_value_cents,
        as_of=prop.estimated_value_as_of,
    )


def build_lines(
    *,
    accounts: Sequence[FinancialAccount],
    mortgages: Sequence[Mortgage],
    properties: Sequence[Property],
) -> list[NetWorthLine]:
    """Every line the page shows today, counted or waiting for a value.

    ``accounts`` are the person's live accounts, open and closed (a closed one
    still claims its loan record); ``mortgages`` their live loan records;
    ``properties`` the workspace's, active and not.
    """
    linked = _linked_mortgage_accounts(accounts)
    property_names = {p.id: p.name for p in properties}
    lines = [_account_line(a) for a in accounts if a.closed_on is None]
    lines += [_mortgage_line(m, property_names) for m in mortgages if m.id not in linked]
    lines += [_property_line(p) for p in properties if p.is_active]
    return lines


def history_sources(
    *,
    accounts: Sequence[FinancialAccount],
    mortgages: Sequence[Mortgage],
    properties: Sequence[Property],
    today_lines: Sequence[NetWorthLine],
) -> dict[SnapshotSourceKey, HistorySource]:
    """How history treats each source still on the books.

    A source missing here (a deleted account or loan record) has its
    snapshots ignored: deleting is the person saying it shouldn't be there.
    """
    counted = {key_of(line) for line in today_lines if is_counted(line)}
    linked = _linked_mortgage_accounts(accounts)
    property_names = {p.id: p.name for p in properties}
    sources: dict[SnapshotSourceKey, HistorySource] = {}
    for line in (
        *(_account_line(a) for a in accounts),
        *(_property_line(p) for p in properties),
    ):
        key = key_of(line)
        sources[key] = HistorySource(line.classification, line.currency, key in counted)
    for mortgage in mortgages:
        line = _mortgage_line(mortgage, property_names)
        key = key_of(line)
        account_id = linked.get(mortgage.id)
        sources[key] = HistorySource(
            line.classification,
            line.currency,
            key in counted,
            represented_by=None if account_id is None else SnapshotSourceKey(SOURCE_ACCOUNT, account_id),
        )
    return sources
