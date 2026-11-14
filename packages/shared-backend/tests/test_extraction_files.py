"""Tests for platform_shared.extraction.files.

Covers the deterministic, network-free parsers: detect_file_type,
extract_zip_files (incl. limits), parse_eml, the CSV branch of
extract_text_from_spreadsheet (incl. the max_chars cap that replaced
the per-app settings read), and the XLSX branch via a round-tripped
openpyxl workbook.
"""
from __future__ import annotations

import io
import threading
import zipfile
from collections.abc import Awaitable, Callable
from pathlib import Path

import openpyxl
import pytest

from platform_shared.extraction import files


class TestDetectFileType:
    @pytest.mark.parametrize(
        "filename,content_type,expected",
        [
            ("scan.JPG", "", "image"),
            ("a.png", "", "image"),
            ("invoice.pdf", "", "pdf"),
            ("notes.docx", "", "docx"),
            ("old.doc", "application/msword", "unknown"),
            ("legacy.XLS", "", "spreadsheet"),
            ("ledger.xlsx", "", "spreadsheet"),
            ("ledger.csv", "", "spreadsheet"),
            ("mail.eml", "", "eml"),
            ("nofield", "message/rfc822", "eml"),
            ("bundle.zip", "", "zip"),
            ("nofield", "application/zip", "zip"),
            ("mystery.bin", "application/octet-stream", "unknown"),
        ],
    )
    def test_detect(self, filename: str, content_type: str, expected: str) -> None:
        assert files.detect_file_type(filename, content_type) == expected


class TestSpreadsheetCsv:
    async def test_csv_respects_max_chars(self) -> None:
        out = await files.extract_text_from_spreadsheet(b"a,b,c\n1,2,3\n", "x.csv", max_chars=5)
        assert out == "a,b,c"

    async def test_csv_under_cap_returns_all(self) -> None:
        out = await files.extract_text_from_spreadsheet(b"a,b", "x.csv", max_chars=999)
        assert out == "a,b"


    async def test_uppercase_csv_is_parsed_as_text(self) -> None:
        out = await files.extract_text_from_spreadsheet(b"a,b\n1,2\n", "BANK.CSV", max_chars=999)
        assert out == "a,b\n1,2\n"


XLS_FIXTURE = Path(__file__).parent / "fixtures" / "legacy_ledger.xls"


class TestSpreadsheetXls:
    async def test_legacy_xls_cells_extracted(self) -> None:
        out = await files.extract_text_from_spreadsheet(
            XLS_FIXTURE.read_bytes(), "legacy.xls", max_chars=10,
        )
        assert out.splitlines()[:5] == [
            "Sheet: Ledger", "vendor\tamount", "Acme\t42", "Bob's Hardware\t19.5", "Sheet: Empty",
        ]

    async def test_xls_detected_by_content_when_filename_missing(self) -> None:
        out = await files.extract_text_from_spreadsheet(XLS_FIXTURE.read_bytes(), "", max_chars=10)
        assert "Acme\t42" in out


class TestLegacyDoc:
    def test_doc_is_not_accepted_as_docx(self) -> None:
        assert files.detect_file_type("Lease.DOC", "application/msword") == "unknown"

    def test_doc_refusal_message_tells_user_to_save_as_docx(self) -> None:
        assert ".docx" in files.unsupported_file_message("Lease.DOC")

    def test_other_unknown_types_get_generic_message(self) -> None:
        assert files.unsupported_file_message("a.bin") == "Unsupported file type"

    def test_zip_skips_doc_members(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("old.doc", b"x")
            zf.writestr("new.docx", b"x")
        assert [n for n, _, _ in files.extract_zip_files(buf.getvalue())] == ["new.docx"]


class TestSpreadsheetXlsx:
    async def test_xlsx_round_trip(self) -> None:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "S1"
        ws.append(["vendor", "amount"])
        ws.append(["Acme", 42])
        buf = io.BytesIO()
        wb.save(buf)

        out = await files.extract_text_from_spreadsheet(buf.getvalue(), "x.xlsx", max_chars=10)
        # XLSX branch does NOT apply max_chars (pre-extraction behaviour —
        # only the 500-row cap applies); the sheet title + rows survive.
        assert "Sheet: S1" in out
        assert "vendor\tamount" in out
        assert "Acme\t42" in out


class TestExtractZipFiles:
    def test_filters_unsupported_and_returns_supported(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("keep.csv", "a,b,c")
            zf.writestr("skip.exe", "MZ...")
            zf.writestr("nested/keep2.pdf", b"%PDF-1.4")
        results = files.extract_zip_files(buf.getvalue())
        names = sorted(n for n, _, _ in results)
        assert names == ["keep.csv", "keep2.pdf"]

    def test_too_many_files_raises(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for i in range(files.MAX_ZIP_FILES + 1):
                zf.writestr(f"f{i}.csv", "x")
        with pytest.raises(ValueError):
            files.extract_zip_files(buf.getvalue())


class TestParseEml:
    def test_body_and_attachment(self) -> None:
        raw = (
            b"From: a@b.com\r\n"
            b"To: c@d.com\r\n"
            b"Subject: hi\r\n"
            b'Content-Type: multipart/mixed; boundary="B"\r\n'
            b"\r\n"
            b"--B\r\n"
            b"Content-Type: text/plain\r\n"
            b"\r\n"
            b"hello body\r\n"
            b"--B\r\n"
            b"Content-Type: application/pdf\r\n"
            b'Content-Disposition: attachment; filename="r.pdf"\r\n'
            b"\r\n"
            b"PDFBYTES\r\n"
            b"--B--\r\n"
        )
        parsed = files.parse_eml(raw)
        assert "hello body" in parsed["body"]
        assert len(parsed["attachments"]) == 1
        assert parsed["attachments"][0]["filename"] == "r.pdf"
        assert parsed["attachments"][0]["content_type"] == "application/pdf"


class TestParsersRunOffTheEventLoop:
    """pypdf / mammoth / openpyxl are CPU-bound; running them on the loop
    thread would freeze every other request (and a worker's heartbeat)."""

    @pytest.mark.parametrize(
        ("parser", "call"),
        [
            ("_pdf_text", lambda: files.extract_text_from_pdf(b"%PDF")),
            ("_docx_text", lambda: files.extract_text_from_docx(b"PK")),
            ("_workbook_text", lambda: files.extract_text_from_spreadsheet(b"PK", "x.xlsx", max_chars=10)),
        ],
    )
    async def test_runs_in_a_worker_thread(
        self, monkeypatch: pytest.MonkeyPatch, parser: str, call: Callable[[], Awaitable[object]],
    ) -> None:
        loop_thread = threading.get_ident()
        seen: list[int] = []

        def _record(_content: bytes) -> str:
            seen.append(threading.get_ident())
            return "text"

        monkeypatch.setattr(files, parser, _record)
        assert await call() == "text"
        assert seen and seen[0] != loop_thread
