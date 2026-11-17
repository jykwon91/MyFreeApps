"""Decide what type a document's file is stored and served as.

The type comes from the bytes, never from the browser's Content-Type or an
email's attachment header: a file named ``x.pdf`` sent as ``text/html`` would
otherwise be served back as a web page.
"""
from app.services.documents.document_mime_constants import (
    DOCUMENT_MIME_TYPES_BY_FILE_TYPE,
    OCTET_STREAM_MIME,
    SERVABLE_DOCUMENT_MIME_TYPES,
)
from app.services.storage.attachment_content import sniff_content_type


def stored_document_mime_type(content: bytes, file_type: str) -> str:
    """Return the sniffed type when it fits ``file_type``, else octet-stream."""
    sniffed = sniff_content_type(content)
    if sniffed is not None and sniffed in DOCUMENT_MIME_TYPES_BY_FILE_TYPE.get(file_type, frozenset()):
        return sniffed
    return OCTET_STREAM_MIME


def servable_document_mime_type(declared: str | None) -> str:
    """Return ``declared`` if it is a type documents are stored as, else octet-stream.

    Covers rows saved before the type was sniffed and attachments served
    straight from Gmail with the sender's header.
    """
    if declared is not None and declared in SERVABLE_DOCUMENT_MIME_TYPES:
        return declared
    return OCTET_STREAM_MIME
