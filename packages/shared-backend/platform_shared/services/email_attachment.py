"""Plain-data record describing a single email attachment.

Used by ``EmailService.send`` / ``send_or_raise`` to attach binary
content (PDFs, images, DOCX, etc.) to outgoing emails. Kept as a
frozen dataclass so callers can build a list of attachments cheaply
and share it across multiple sends.

The shared service does NOT inspect ``content_type`` against an
allowlist — that decision belongs to the calling app (the lease-email
service in MyBookkeeper, for instance, only attaches kinds already
validated upstream by ``ALLOWED_ATTACHMENT_MIME_TYPES``).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str
