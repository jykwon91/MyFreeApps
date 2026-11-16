from app.core.document_constants import (
    DOCUMENT_IN_PROGRESS_STATUSES,
    DOCUMENT_NEEDS_REVIEW_STATUSES,
)
from app.schemas.documents.document_summary import DocumentSummary


def to_document_summary(status_counts: dict[str, int]) -> DocumentSummary:
    return DocumentSummary(
        total=sum(status_counts.values()),
        in_progress=sum(status_counts.get(status, 0) for status in DOCUMENT_IN_PROGRESS_STATUSES),
        needs_review=sum(status_counts.get(status, 0) for status in DOCUMENT_NEEDS_REVIEW_STATUSES),
    )
