from app.core.document_constants import DOCUMENT_BEING_READ_DETAIL


class DocumentBeingReadError(Exception):
    """The document is still being read by extraction, so it cannot be changed yet."""

    def __init__(self) -> None:
        super().__init__(DOCUMENT_BEING_READ_DETAIL)
