"""Where a row from a bank feed came from (``transactions.external_source``).

A bank feed is a statement of what moved through an account: the bank sync
(Plaid) and a bank CSV export. Its rows are what a cash view counts once the
feed covers a date — see ``app/repositories/cash_flow/cash_basis.py``.
"""
from typing import Final

from app.core.plaid_constants import PLAID_EXTERNAL_SOURCE

BANK_CSV_EXTERNAL_SOURCE: Final = "bank_csv"

BANK_FEED_SOURCES: Final[tuple[str, ...]] = (PLAID_EXTERNAL_SOURCE, BANK_CSV_EXTERNAL_SOURCE)
