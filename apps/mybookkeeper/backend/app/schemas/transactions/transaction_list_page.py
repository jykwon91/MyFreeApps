"""One page of GET /transactions/page: its rows, and how many match the filters across every page."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.transactions.transaction import TransactionRead


class TransactionListPage(ListResponse[TransactionRead]):
    pass
