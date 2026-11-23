"""Wording for "this upload is too large", shared by the routes and the services.

A route now refuses an oversized file while reading it, before the service sees
the bytes, so both have to say the same thing for the same limit.
"""
from app.core.config import settings


def exceeds_limit_message(subject: str, max_bytes: int) -> str:
    """``"<subject> exceeds <N>MB limit"`` for a limit of ``max_bytes``."""
    return f"{subject} exceeds {max_bytes // (1024 * 1024)}MB limit"


def document_too_large_message() -> str:
    """The rejection for a document upload over ``max_upload_size_bytes``."""
    return exceeds_limit_message("File", settings.max_upload_size_bytes)


def attachment_too_large_message(subject: str = "File") -> str:
    """The rejection for an attachment over ``max_blackout_attachment_size_bytes``."""
    return exceeds_limit_message(subject, settings.max_blackout_attachment_size_bytes)
