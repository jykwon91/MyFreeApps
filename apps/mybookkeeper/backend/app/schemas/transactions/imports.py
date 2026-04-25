from pydantic import BaseModel


class TransactionPreview(BaseModel):
    date: str
    vendor: str | None
    amount: str
    transaction_type: str
    category: str


class ImportResult(BaseModel):
    imported: int
    skipped_duplicates: int
    format_detected: str
    preview: list[TransactionPreview]
