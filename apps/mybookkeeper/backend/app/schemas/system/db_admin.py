"""Schemas for admin database query and maintenance endpoints."""
import uuid

from pydantic import BaseModel


class DbQueryRequest(BaseModel):
    sql: str


class DbQueryResponse(BaseModel):
    columns: list[str]
    rows: list[list[object]]
    row_count: int


class BulkPropertyReassignRequest(BaseModel):
    vendor: str
    filename_pattern: str
    target_property_id: uuid.UUID


class BulkSubCategoryFixRequest(BaseModel):
    vendor: str
    description_pattern: str
    new_sub_category: str


class BulkSoftDeleteRequest(BaseModel):
    vendor: str
    category: str | None = None
    source: str | None = None
    description_pattern: str | None = None


class ReExtractDocumentsRequest(BaseModel):
    document_ids: list[uuid.UUID]


class BulkUpdateResponse(BaseModel):
    updated: int
