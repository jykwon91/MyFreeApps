"""File parsing utilities — bytes in, text/base64 out.

Extracted verbatim from MyBookkeeper's extractor_service. Pure
functions, zero domain coupling — any app that needs to turn an
uploaded PDF / DOCX / spreadsheet / zip / .eml into text or base64 for
a model call uses these.

The heavy third-party parsers (pypdf, mammoth, openpyxl, xlrd) are imported
lazily inside the functions that use them, so an app that imports
``platform_shared`` but never parses documents doesn't need them
installed (same optional-dependency convention as
``platform_shared.services.sms_service`` lazily importing ``twilio``).

The parsers are CPU-bound and can take seconds on a large file, so the async
entry points run them in a worker thread (``asyncio.to_thread``) instead of
freezing the event loop — which would stall every other request, and a
worker's heartbeat, for the duration.

``extract_text_from_spreadsheet`` takes ``max_chars`` as a required
keyword instead of reading a per-app settings module — the caller
threads its own configured cap (config stays out of shared code).

The pre-extraction ``file_to_base64`` helper had no callers and was not
carried over.
"""
from __future__ import annotations

import asyncio
import email as email_lib
import io
import mimetypes
import re
import zipfile
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from xlrd.sheet import Cell

MAX_SPREADSHEET_ROWS = 500
OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy BIFF .xls container

# Starts with "Unsupported file type" so callers that map that phrase to a 415
# (MBK's upload_error_status) keep doing so.
LEGACY_DOC_MESSAGE = (
    "Unsupported file type: legacy .doc files can't be read. Open the file in "
    "Word, save it as .docx, and upload it again."
)

MAX_ZIP_FILES = 500
MAX_ZIP_DECOMPRESSED_BYTES = 500 * 1024 * 1024  # 500MB
MAX_ZIP_FILE_BYTES = 20 * 1024 * 1024  # 20MB per file


def _pdf_text(content: bytes) -> str | None:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return text.strip() or None


def _docx_text(content: bytes) -> str:
    import mammoth

    result = mammoth.extract_raw_text(io.BytesIO(content))
    return result.value.strip()


def _sheet_rows_text(sheets: Iterable[tuple[str, Iterable[Sequence[object]]]]) -> str:
    rows: list[str] = []
    for title, sheet_rows in sheets:
        rows.append(f"Sheet: {title}")
        for row in sheet_rows:
            if any(cell is not None and cell != "" for cell in row):
                rows.append("\t".join("" if c is None else str(c) for c in row))
        if len(rows) > MAX_SPREADSHEET_ROWS:
            break
    return "\n".join(rows)


def _workbook_text(content: bytes) -> str:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    return _sheet_rows_text((s.title, s.iter_rows(values_only=True)) for s in wb.worksheets)


def _xls_cell_value(cell: "Cell", datemode: int) -> object:
    import xlrd

    if cell.ctype == xlrd.XL_CELL_DATE:
        return xlrd.xldate.xldate_as_datetime(cell.value, datemode)
    if cell.ctype == xlrd.XL_CELL_NUMBER and float(cell.value).is_integer():
        return int(cell.value)
    if cell.ctype == xlrd.XL_CELL_BOOLEAN:
        return bool(cell.value)
    if cell.ctype in (xlrd.XL_CELL_ERROR, xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
        return None
    return cell.value


def _xls_text(content: bytes) -> str:
    import xlrd

    book = xlrd.open_workbook(file_contents=content, on_demand=True)
    return _sheet_rows_text(
        (
            sheet.name,
            (
                [_xls_cell_value(c, book.datemode) for c in sheet.row(i)]
                for i in range(sheet.nrows)
            ),
        )
        for sheet in book.sheets()
    )


async def extract_text_from_pdf(content: bytes) -> str | None:
    return await asyncio.to_thread(_pdf_text, content)


async def extract_text_from_docx(content: bytes) -> str:
    return await asyncio.to_thread(_docx_text, content)


async def extract_text_from_spreadsheet(content: bytes, filename: str, *, max_chars: int) -> str:
    if _suffix(filename) == ".csv":
        text = content.decode("utf-8", errors="replace")
        return text[:max_chars]
    if content.startswith(OLE2_MAGIC):
        return await asyncio.to_thread(_xls_text, content)
    return await asyncio.to_thread(_workbook_text, content)


def _suffix(filename: str) -> str:
    return Path(filename).suffix.lower()


def unsupported_file_message(filename: str) -> str:
    if _suffix(filename) == ".doc":
        return LEGACY_DOC_MESSAGE
    return "Unsupported file type"


def detect_file_type(filename: str, content_type: str) -> str:
    ext = _suffix(filename)
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        return "image"
    if ext == ".pdf":
        return "pdf"
    if ext == ".docx":
        return "docx"
    if ext in (".xls", ".xlsx", ".csv"):
        return "spreadsheet"
    if ext == ".eml" or content_type == "message/rfc822":
        return "eml"
    if ext == ".zip" or content_type == "application/zip":
        return "zip"
    return "unknown"


def extract_zip_files(content: bytes) -> list[tuple[str, bytes, str]]:
    """Extract supported files from a zip archive.

    Returns list of (filename, file_content, content_type) tuples.
    Raises ValueError if limits are exceeded.
    """
    supported_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".docx", ".xls", ".xlsx", ".csv", ".eml"}
    results: list[tuple[str, bytes, str]] = []
    total_bytes = 0

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            ext = _suffix(info.filename)
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
