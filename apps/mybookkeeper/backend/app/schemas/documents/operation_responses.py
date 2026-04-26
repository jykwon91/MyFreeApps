from pydantic import BaseModel


class EscrowPaidRequest(BaseModel):
    is_escrow_paid: bool


class CancelBatchResponse(BaseModel):
    cancelled: int


class ReExtractResponse(BaseModel):
    status: str


class ReplaceFileResponse(BaseModel):
    status: str


class EscrowPaidResponse(BaseModel):
    is_escrow_paid: bool
    transactions_removed: int


class BulkDeleteDocumentsResponse(BaseModel):
    deleted: int
