"""The MIME types a document's file may be stored and served as."""
from app.services.storage.attachment_content import DOCX_MIME, XLSX_MIME

OCTET_STREAM_MIME = "application/octet-stream"

# Document.file_type of a document extracted from a Gmail message.
EMAIL_FILE_TYPE = "email"

_IMAGE_MIME_TYPES: frozenset[str] = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})
_PDF_MIME_TYPES: frozenset[str] = frozenset({"application/pdf"})
_DOCX_MIME_TYPES: frozenset[str] = frozenset({DOCX_MIME})
# A CSV sniffs as plain text; a legacy .xls has no type we can confirm from its bytes.
_SPREADSHEET_MIME_TYPES: frozenset[str] = frozenset({XLSX_MIME, "text/plain"})

# Keyed by Document.file_type. The sniffed type is kept only when it matches
# the kind of file the name claims; anything else is stored as octet-stream.
DOCUMENT_MIME_TYPES_BY_FILE_TYPE: dict[str, frozenset[str]] = {
    "image": _IMAGE_MIME_TYPES,
    "pdf": _PDF_MIME_TYPES,
    "docx": _DOCX_MIME_TYPES,
    "spreadsheet": _SPREADSHEET_MIME_TYPES,
    # A Gmail attachment saved with its extracted document.
    EMAIL_FILE_TYPE: _IMAGE_MIME_TYPES | _PDF_MIME_TYPES | _DOCX_MIME_TYPES | _SPREADSHEET_MIME_TYPES,
}

# Types rows saved before sniffing may carry that are still safe to serve as-is
# (a browser shows them as text, never runs them).
_LEGACY_STORED_MIME_TYPES: frozenset[str] = frozenset({"text/csv"})

# Every type a stored document is served as. Any other stored type
# (text/html, image/svg+xml, ...) is served as octet-stream.
SERVABLE_DOCUMENT_MIME_TYPES: frozenset[str] = frozenset().union(
    *DOCUMENT_MIME_TYPES_BY_FILE_TYPE.values(), _LEGACY_STORED_MIME_TYPES,
)
