"""Tests for platform_shared.extraction.files.

Covers the deterministic, network-free parsers: detect_file_type,
extract_zip_files (incl. limits), parse_eml, the CSV branch of
extract_text_from_spreadsheet (incl. the max_chars cap that replaced
the per-app settings read), and the XLSX branch via a round-tripped
openpyxl workbook.
"""
from __future__ import annotations

import io
import zipfile

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
