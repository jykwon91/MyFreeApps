import base64
import logging
import re
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path
from typing import NotRequired, TypedDict

from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from app.core.config import settings
from app.services.email.exceptions import GmailReauthRequiredError, GmailSendError, GmailSendScopeError

logger = logging.getLogger(__name__)


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
        token=access_token,
        refresh_token=refresh_token,
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


BOUNCE_BODY_PREVIEW_BYTES = 2048


def list_email_document_sources(service, message_id: str) -> dict:
    """Fetch MIME structure without downloading attachment bytes.

    Returns
        {
            "subject": str,
            "from_address": str | None,
            "headers": {<header-name>: <value>},
            "body_preview": str | None,
            "sources": [{"attachment_id": str, "filename": str | None, "content_type": str}],
        }

    The bounce-detection signals (`from_address`, `headers`, `body_preview`)
    are included so callers can short-circuit downstream extraction without
    a second Gmail round-trip. `body_preview` is truncated to keep memory
    bounded — only the first ~2KB is needed to find DSN fingerprints.

    Uses attachment_id="body" when there are no supported attachments.
    """
    detail = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in detail["payload"].get("headers", [])}
    subject = headers.get("Subject", "")
    from_address = headers.get("From")

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

    body = _extract_body(detail["payload"])
    body_preview: str | None = body[:BOUNCE_BODY_PREVIEW_BYTES] if body else None

    return {
        "subject": subject,
        "from_address": from_address,
        "headers": headers,
        "body_preview": body_preview,
        "sources": sources,
    }


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


def send_message(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    *,
    from_address: str,
    to_address: str,
    subject: str,
    body: str,
    in_reply_to_message_id: str | None = None,
) -> str:
    """Send a plaintext email via Gmail API on behalf of the host.

    Builds an RFC 5322 message via ``email.message.EmailMessage`` (which
    handles header folding, encoding, and Message-ID generation correctly),
    base64url-encodes it, and POSTs to ``users.messages.send``.

    Threading: when ``in_reply_to_message_id`` is provided the outbound
    message gets ``In-Reply-To`` and ``References`` headers so Gmail (and
    other RFC-compliant clients) thread the reply with the original inquiry
    email.

    Returns the Gmail-issued message ID (used to dedup replies and to look
    up the message on the server later).

    Raises:
        GmailSendScopeError: 403 because the integration lacks ``gmail.send``.
            The host must reconnect Gmail with the broader scope set.
        GmailSendError: 400 (malformed) / 5xx (Gmail outage) / network errors.
            The caller should treat this as a transient failure — no message
            row is persisted and the inquiry stage doesn't advance.
    """
    if not integration.access_token:
        # Defensive — the caller should have validated this already.
        raise GmailSendScopeError("Gmail integration has no access token")

    message = EmailMessage()
    message["From"] = from_address
    message["To"] = to_address
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain="mybookkeeper.app")
    if in_reply_to_message_id:
        # Both headers are needed per RFC 5322 §3.6.4 — In-Reply-To handles
        # the immediate parent, References preserves the chain for clients
        # that walk the full thread.
        message["In-Reply-To"] = in_reply_to_message_id
        message["References"] = in_reply_to_message_id
    message.set_content(body)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")

    service = get_gmail_service(integration.access_token, integration.refresh_token)
    try:
        sent = service.users().messages().send(
            userId="me", body={"raw": raw},
        ).execute()
    except RefreshError as exc:
        logger.warning("Gmail send rejected — refresh token invalid: %s", exc)
        raise GmailReauthRequiredError(
            "Gmail token expired. Reconnect Gmail to send replies."
        ) from exc
    except HttpError as exc:
        status = getattr(getattr(exc, "resp", None), "status", None)
        if status == 401:
            logger.warning("Gmail send rejected with 401 — token rejected by Google")
            raise GmailReauthRequiredError(
                "Gmail token rejected (401). Reconnect Gmail to send replies."
            ) from exc
        if status == 403:
            logger.warning(
                "Gmail send rejected with 403 — likely missing gmail.send scope",
            )
            raise GmailSendScopeError(
                "Gmail send permission missing. Reconnect Gmail to enable replies.",
            ) from exc
        logger.warning("Gmail send failed: status=%s", status)
        raise GmailSendError(f"Gmail rejected the message (status {status})") from exc
    except Exception as exc:  # network errors, JSON parse errors, etc.
        logger.warning("Gmail send raised an unexpected error", exc_info=True)
        raise GmailSendError("Gmail send failed unexpectedly") from exc

    sent_id = sent.get("id")
    if not isinstance(sent_id, str) or not sent_id:
        raise GmailSendError("Gmail did not return a message id")
    return sent_id
