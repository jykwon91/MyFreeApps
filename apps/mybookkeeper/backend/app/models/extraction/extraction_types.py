"""TypedDicts for Claude extraction response shapes."""

from typing import TypedDict


class ExtractionData(TypedDict, total=False):
    date: str
    vendor: str
    amount: str
    description: str
    tags: list[str]
    confidence: str
    tax_relevant: bool
    channel: str
    address: str
    line_items: list[dict[str, str]]
    document_type: str
    category: str
    sub_category: str
    transaction_type: str
    payment_method: str
    payer_name: str
    payer_handle: str
    sender: str
    file_name: str


class ExtractionResult(TypedDict):
    data: list[ExtractionData]
    tokens: int
