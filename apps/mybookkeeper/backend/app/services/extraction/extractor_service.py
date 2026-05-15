"""MyBookkeeper file-parsing wrapper around platform_shared.extraction.files.

The parsers are domain-free and now live in the shared package. This
module re-exports them so every existing import path
(``app.services.extraction.extractor_service``) keeps resolving, and
threads MBK's configured spreadsheet cap into the one parser that needs
a per-app value.

The pre-extraction ``file_to_base64`` helper had no callers and was not
carried over.
"""
from app.core.config import settings
from platform_shared.extraction.files import (
    detect_file_type,
    extract_text_from_docx,
    extract_text_from_pdf,
    extract_zip_files,
    parse_eml,
)
from platform_shared.extraction.files import (
    extract_text_from_spreadsheet as _shared_extract_text_from_spreadsheet,
)

__all__ = [
    "extract_text_from_pdf",
    "extract_text_from_docx",
    "extract_text_from_spreadsheet",
    "detect_file_type",
    "extract_zip_files",
    "parse_eml",
]


async def extract_text_from_spreadsheet(content: bytes, filename: str) -> str:
    return await _shared_extract_text_from_spreadsheet(
        content, filename, max_chars=settings.max_spreadsheet_chars
    )
