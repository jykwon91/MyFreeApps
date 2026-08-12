"""Tests for the upload-rejection to HTTP-status mapping.

``accept_upload`` reports every rejection as a bare ``ValueError``, so this
mapping is the only thing standing between "your file is 12MB" and a generic
422 that tells the caller nothing. It is shared by every upload route, which is
the point — a file too big for the Documents page has to be too big for the
utility-plan dialog, with the same status code.
"""
from __future__ import annotations

import pytest

from app.core.upload_errors import upload_error_status


class TestUploadErrorStatus:
    def test_a_file_over_the_size_cap_is_413(self) -> None:
        assert upload_error_status("File exceeds 10MB limit") == 413

    def test_the_daily_cap_is_429_not_413(self) -> None:
        """Both messages say "limit"; only one of them is about the file."""
        assert upload_error_status("Daily upload limit reached") == 429

    def test_an_unsupported_type_is_415(self) -> None:
        assert upload_error_status("Unsupported file type") == 415

    @pytest.mark.parametrize(
        "message",
        ["File is empty", "No supported files found in zip", "something else"],
    )
    def test_anything_else_is_422(self, message: str) -> None:
        assert upload_error_status(message) == 422
