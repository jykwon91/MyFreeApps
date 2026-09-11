"""Tests for object-key construction — the untrusted-filename sanitizer.

``StorageClient.generate_key`` embeds a client-supplied multipart filename
into the object key. These tests pin the sanitization so a hostile filename
(path separators, ``..``, control chars) can never reshape the key, poison a
downstream ``Content-Disposition`` header, or traverse a local path if the
key is ever materialized onto a filesystem.
"""
import re
import uuid

import pytest

from platform_shared.core.storage import StorageClient, sanitize_key_segment


class TestSanitizeKeySegment:
    def test_plain_name_is_preserved(self):
        assert sanitize_key_segment("resume.pdf") == "resume.pdf"

    def test_extension_is_kept(self):
        assert sanitize_key_segment("Lease Agreement.PDF") == "Lease_Agreement.PDF"

    @pytest.mark.parametrize(
        "hostile",
        [
            "../../../etc/passwd",
            "..\\..\\windows\\system32\\config",
            "/etc/shadow",
            "C:\\Users\\me\\secret.txt",
            "sub/dir/nested.pdf",
        ],
    )
    def test_path_components_are_stripped(self, hostile):
        out = sanitize_key_segment(hostile)
        assert "/" not in out
        assert "\\" not in out
        assert ".." not in out

    @pytest.mark.parametrize(
        "hostile",
        ["evil\x00.pdf", "line\r\ninjection.pdf", "tab\there.pdf"],
    )
    def test_control_characters_are_removed(self, hostile):
        out = sanitize_key_segment(hostile)
        assert re.fullmatch(r"[A-Za-z0-9._-]+", out)

    @pytest.mark.parametrize("dotty", ["..", ".", "...", ".hidden"])
    def test_leading_dots_are_stripped(self, dotty):
        out = sanitize_key_segment(dotty)
        assert not out.startswith(".")
        assert out  # never empty

    @pytest.mark.parametrize("empty", ["", "/", "\\", "///", "\x00", "___"])
    def test_falls_back_when_nothing_safe_remains(self, empty):
        assert sanitize_key_segment(empty) == "file"

    def test_length_is_bounded(self):
        out = sanitize_key_segment("a" * 5000 + ".pdf")
        assert len(out) <= 200

    def test_idempotent_on_already_safe_input(self):
        safe = "photo-abc123.jpg"
        assert sanitize_key_segment(sanitize_key_segment(safe)) == safe


class TestGenerateKey:
    def test_shape_is_prefix_uuid_sanitized_name(self):
        key = StorageClient.generate_key("resumes", "../../evil.pdf")
        parts = key.split("/")
        assert len(parts) == 3
        assert parts[0] == "resumes"
        uuid.UUID(parts[1])  # middle segment is a valid uuid
        assert parts[2] == "evil.pdf"

    def test_hostile_filename_cannot_add_key_segments(self):
        key = StorageClient.generate_key("applicants", "a/b/c/d.pdf")
        # prefix + uuid + single sanitized filename == exactly 3 segments
        assert len(key.split("/")) == 3
