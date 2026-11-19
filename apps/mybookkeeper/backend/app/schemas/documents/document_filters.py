import uuid

from pydantic import BaseModel, Field

from app.core.document_list_constants import MAX_DOCUMENT_SEARCH_LENGTH


class DocumentFilters(BaseModel):
    """How the documents list is narrowed: its pages and "select all" read the same filters.

    Routes take it as a query-parameter model (``Annotated[DocumentFilters, Query()]``), which is
    what lets the list fields repeat in the query string (``statuses=a&statuses=b``). An empty list
    leaves that column alone.
    """

    property_id: uuid.UUID | None = None
    # Part of the file name, any case.
    search: str = Field(default="", max_length=MAX_DOCUMENT_SEARCH_LENGTH)
    statuses: list[str] = []
    document_types: list[str] = []
    sources: list[str] = []
    # Only what the library holds: no document still being read, a duplicate or one deleted.
    exclude_processing: bool = False
    # Only the ones that need a look: failed or a duplicate.
    needs_review: bool = False
