from app.models.responses.document_delete_result import DocumentDeleteResult
from app.schemas.documents.bulk_delete_documents_response import BulkDeleteDocumentsResponse
from app.schemas.documents.skipped_document import SkippedDocument


def to_bulk_delete_response(result: DocumentDeleteResult) -> BulkDeleteDocumentsResponse:
    skipped = [SkippedDocument(id=i, reason="not_found") for i in result.not_found]
    skipped += [SkippedDocument(id=i, reason="being_read") for i in result.being_read]
    return BulkDeleteDocumentsResponse(deleted=result.deleted, skipped=skipped)
