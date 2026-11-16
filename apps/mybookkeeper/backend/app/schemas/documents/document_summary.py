from pydantic import BaseModel


class DocumentSummary(BaseModel):
    """How many documents the organization has, without sending the documents themselves."""

    total: int
    in_progress: int
    needs_review: int
