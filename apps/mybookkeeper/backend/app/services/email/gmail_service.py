import base64
import re
from pathlib import Path
from typing import NotRequired, TypedDict

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.core.config import settings
from app.core.security import decrypt_token


class _GmailBody(TypedDict, total=False):
    data: str
    attachmentId: str
    size: int


class _GmailHeader(TypedDict):
    name: str
    value: str


class _GmailPayload(TypedDict, total=False):
    mimeType: str
    filename: str
    headers: list[_GmailHeader]
    body: _GmailBody
    parts: "list[_GmailPayload]"


SUPPORTED_ATTACHMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".eml"}


def _normalize_filename(raw: str) -> str:
    """Normalize a Gmail attachment filename.

    Gmail sometimes returns duplicate attachment entries with whitespace
    control characters embedded in the filename (e.g. ``\\n``), and
    occasionally double extensions like ``.pdf.pdf``.
    """
    # Strip control characters and collapse whitespace
    cleaned = re.sub(r"[\n\r\t]+", " ", raw)
    cleaned = re.sub(r" {2,}", " ", cleaned).strip()
    # Fix double extensions (.pdf.pdf → .pdf, .xlsx.xlsx → .xlsx, etc.)
    for ext in SUPPORTED_ATTACHMENT_EXTENSIONS:
        if cleaned.lower().endswith(ext + ext):
            cleaned = cleaned[: len(cleaned) - len(ext)]
            break
    return cleaned


def get_gmail_service(access_token: str, refresh_token: str | None = None):
    creds = Credentials(
        token=decrypt_token(access_token),
        refresh_token=decrypt_token(refresh_token) if refresh_token else None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )
    return build("gmail", "v1", credentials=creds)


def list_new_email_ids(
    service, processed_ids: set[str], *, label: str | None = None,
) -> list[str]:
    query = settings.gmail_search_query
    label_ids: list[str] | None = None

    if label:
        resolved_id = _resolve_label_id(service, label)
        if resolved_id:
            label_ids = [resolved_id]

    kwargs: dict = {"userId": "me", "q": query, "maxResults": 50}
    if label_ids:
        kwargs["labelIds"] = label_ids

    results = service.users().messages().list(**kwargs).execute()
    messages = results.get("messages", [])
    return [msg["id"] for msg in messages if msg["id"] not in processed_ids]


def _resolve_label_id(service, label_name: str) -> str | None:
    """Resolve a Gmail label name to its ID."""
    try:
        results = service.users().labels().list(userId="me").execute()
        for lbl in results.get("labels", []):
            if lbl["name"].lower() == label_name.lower():
                return lbl["id"]
    except Exception:
        pass
    return None


def fetch_email_by_id(service, message_id: str) -> dict | None:
    detail = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    return _parse_message(detail, service)


def list_email_document_sources(service, message_id: str) -> dict:
    """Fetch MIME structure without downloading attachment bytes.

    Returns {"subject": str, "sources": [{"attachment_id": str, "filename": str | None, "content_type": str}]}.
    Uses attachment_id="body" when there are no supported attachments.
    """
    detail = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in detail["payload"].get("headers", [])}
    subject = headers.get("Subject", "")

    raw_sources: list[dict] = []
    _collect_attachment_metadata(detail["payload"], raw_sources)

    # Deduplicate by normalized filename — Gmail can return the same PDF
    # twice with slight filename variations (e.g. embedded newlines).
    seen_filenames: set[str] = set()
    sources: list[dict] = []
    for src in raw_sources:
        key = (src.get("filename") or "").lower()
        if key and key in seen_filenames:
            continue
        seen_filenames.add(key)
        sources.append(src)

    if not sources:
        sources = [{"attachment_id": "body", "filename": None, "content_type": "text/plain"}]

    return {"subject": subject, "sources": sources}


def _collect_attachment_metadata(payload: _GmailPayload, result: list[dict]) -> None:
    raw_filename = payload.get("filename", "")
    filename = _normalize_filename(raw_filename) if raw_filename else ""
    if filename and Path(filename).suffix.lower() in SUPPORTED_ATTACHMENT_EXTENSIONS:
        attachment_id = payload.get("body", {}).get("attachmentId")
        if attachment_id:
            result.append({
                "attachment_id": attachment_id,
                "filename": filename,
                "content_type": payload.get("mimeType", "application/octet-stream"),
            })
    for part in payload.get("parts", []):
        _collect_attachment_metadata(part, result)


def fetch_attachment_bytes(service, message_id: str, attachment_id: str) -> bytes:
    """Download a single attachment by its Gmail attachment ID."""
    att = service.users().messages().attachments().get(
        userId="me", messageId=message_id, id=attachment_id
    ).execute()
    return base64.urlsafe_b64decode(att["data"] + "==")


def fetch_email_body(service, message_id: str) -> dict:
    """Fetch subject and body text of an email without downloading attachments."""
    detail = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in detail["payload"].get("headers", [])}
    return {
        "message_id": message_id,
        "subject": headers.get("Subject", ""),
        "body": _extract_body(detail["payload"]),
    }


def fetch_new_invoice_emails(service, processed_ids: set[str]) -> list[dict]:
    results = service.users().messages().list(
        userId="me", q=settings.gmail_search_query, maxResults=50
    ).execute()
    messages = results.get("messages", [])

    new_emails = []
    for msg in messages:
        if msg["id"] in processed_ids:
            continue
        detail = service.users().messages().get(userId="me", id=msg["id"], format="full").execute()
        parsed = _parse_message(detail, service)
        if parsed:
            new_emails.append(parsed)

    return new_emails


def _parse_message(message: dict, service) -> dict | None:
    headers = {h["name"]: h["value"] for h in message["payload"].get("headers", [])}
    subject = headers.get("Subject", "")
    body = _extract_body(message["payload"])
    attachments = _extract_attachments(message["payload"], service, message["id"])
    if not body and not attachments:
        return None
    return {
        "message_id": message["id"],
        "subject": subject,
        "body": body,
        "date": headers.get("Date"),
        "attachments": attachments,
    }


def _extract_body(payload: _GmailPayload) -> str:
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

    if payload.get("mimeType") == "text/html":
        data = payload.get("body", {}).get("data", "")
        raw = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
        return re.sub(r"<[^>]+>", " ", raw)

    for part in payload.get("parts", []):
        result = _extract_body(part)
        if result:
            return result

    return ""


def _extract_attachments(payload: _GmailPayload, service, message_id: str) -> list[dict]:
    attachments: list[dict] = []
    _collect_attachments(payload, service, message_id, attachments)
    return attachments


def _collect_attachments(payload: _GmailPayload, service, message_id: str, result: list[dict]) -> None:
    raw_filename = payload.get("filename", "")
    filename = _normalize_filename(raw_filename) if raw_filename else ""
    if filename and Path(filename).suffix.lower() in SUPPORTED_ATTACHMENT_EXTENSIONS:
        attachment_id = payload.get("body", {}).get("attachmentId")
        if attachment_id:
            att = service.users().messages().attachments().get(
                userId="me", messageId=message_id, id=attachment_id
            ).execute()
            data = base64.urlsafe_b64decode(att["data"] + "==")
            result.append({
                "filename": filename,
                "content_type": payload.get("mimeType", "application/octet-stream"),
                "data": data,
            })
    for part in payload.get("parts", []):
        _collect_attachments(part, service, message_id, result)
