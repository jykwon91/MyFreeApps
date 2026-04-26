from pydantic import BaseModel


class KeepDuplicateResponse(BaseModel):
    kept: int
    deleted: int


class DismissDuplicatesResponse(BaseModel):
    reviewed: int


class MergeDuplicatesResponse(BaseModel):
    merged: bool
    surviving_id: str


class BulkApproveResponse(BaseModel):
    approved: int
    skipped: int


class BulkDeleteResponse(BaseModel):
    deleted: int
