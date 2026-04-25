import email as email_lib
import io
import base64
import mimetypes
import re
import zipfile
from pathlib import Path

import mammoth
import openpyxl
from pypdf import PdfReader

from app.core.config import settings


async def extract_text_from_pdf(content: bytes) -> str | None:
    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return text.strip() or None


async def extract_text_from_docx(content: bytes) -> str:
    result = mammoth.extract_raw_text(io.BytesIO(content))
    return result.value.strip()


async def extract_text_from_spreadsheet(content: bytes, filename: str) -> str:
    if filename.endswith(".csv"):
        text = content.decode("utf-8", errors="replace")
        return text[:settings.max_spreadsheet_chars]

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    rows = []
    for sheet in wb.worksheets:
        rows.append(f"Sheet: {sheet.title}")
        for row in sheet.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                rows.append("\t".join(str(c) if c is not None else "" for c in row))
        if len(rows) > 500:
            break
    return "\n".join(rows)


def file_to_base64(content: bytes) -> str:
    return base64.standard_b64encode(content).decode("utf-8")


def detect_file_type(filename: str, content_type: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        return "image"
    if ext == ".pdf":
        return "pdf"
    if ext in (".doc", ".docx"):
        return "docx"
    if ext in (".xls", ".xlsx", ".csv"):
        return "spreadsheet"
    if ext == ".eml" or content_type == "message/rfc822":
        return "eml"
    if ext == ".zip" or content_type == "application/zip":
        return "zip"
    return "unknown"


MAX_ZIP_FILES = 500
MAX_ZIP_DECOMPRESSED_BYTES = 500 * 1024 * 1024  # 500MB
MAX_ZIP_FILE_BYTES = 20 * 1024 * 1024  # 20MB per file


def extract_zip_files(content: bytes) -> list[tuple[str, bytes, str]]:
    """Extract supported files from a zip archive.

    Returns list of (filename, file_content, content_type) tuples.
    Raises ValueError if limits are exceeded.
    """
    supported_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".eml"}
    results: list[tuple[str, bytes, str]] = []
    total_bytes = 0

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            ext = Path(info.filename).suffix.lower()
            if ext not in supported_exts:
                continue
            if info.file_size > MAX_ZIP_FILE_BYTES:
                continue
            if len(results) >= MAX_ZIP_FILES:
                raise ValueError(f"Zip contains more than {MAX_ZIP_FILES} supported files")
            total_bytes += info.file_size
            if total_bytes > MAX_ZIP_DECOMPRESSED_BYTES:
                raise ValueError("Zip decompressed size exceeds limit")
            name = Path(info.filename).name
            data = zf.read(info)
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            results.append((name, data, mime))

    return results


def parse_eml(content: bytes) -> dict:
    """Parse a .eml file and return its text body and nested attachments."""
    msg = email_lib.message_from_bytes(content)
    body = ""
    attachments = []

    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = part.get("Content-Disposition", "")
        filename = part.get_filename()

        if filename:
            payload = part.get_payload(decode=True)
            if payload:
                attachments.append({
                    "filename": filename,
                    "content_type": content_type,
                    "data": payload,
                })
        elif content_type == "text/plain" and "attachment" not in disposition:
            payload = part.get_payload(decode=True)
            if payload:
                body += payload.decode("utf-8", errors="replace")
        elif content_type == "text/html" and "attachment" not in disposition and not body:
            payload = part.get_payload(decode=True)
            if payload:
                raw = payload.decode("utf-8", errors="replace")
                body = re.sub(r"<[^>]+>", " ", raw)

    return {"body": body, "attachments": attachments}
