"""Fingerprint of a reply as the host submitted it."""
from __future__ import annotations

import hashlib
import json

from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest


def reply_request_hash(request: InquiryReplyRequest) -> str:
    """sha256 hex of the template, subject and body — the pet disclosure the server adds is not part of it."""
    canonical = json.dumps(
        [str(request.template_id) if request.template_id else None, request.subject, request.body],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
