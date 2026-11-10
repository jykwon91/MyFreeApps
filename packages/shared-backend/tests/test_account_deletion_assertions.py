"""Unit tests for the one-call account-deletion assertions."""
import pytest
from sqlalchemy import Column, ForeignKey, Integer, MetaData, String, Table

from platform_shared.testing.account_deletion_assertions import assert_account_deletion_schema


def _metadata(*extra: str, ondelete: str = "CASCADE") -> MetaData:
    md = MetaData()
    Table("users", md, Column("id", Integer, primary_key=True))
    Table(
        "posts", md, Column("id", Integer, primary_key=True),
        Column("user_id", Integer, ForeignKey("users.id", ondelete=ondelete)),
        *(Column(name, String) for name in extra),
    )
    return md


def test_clean_schema_passes() -> None:
    assert_account_deletion_schema(_metadata("title"), "users", not_stored_files={})


def test_non_cascading_fk_fails() -> None:
    with pytest.raises(AssertionError, match="do not ON DELETE CASCADE"):
        assert_account_deletion_schema(_metadata(ondelete="RESTRICT"), "users", not_stored_files={})


def test_suspect_fails_with_guidance() -> None:
    with pytest.raises(AssertionError, match="NOT_STORED_FILE_COLUMNS"):
        assert_account_deletion_schema(_metadata("cover_url"), "users", not_stored_files={})


def test_excused_or_covered_suspect_passes() -> None:
    md = _metadata("cover_url", "file_path")
    assert_account_deletion_schema(
        md, "users",
        not_stored_files={"posts.cover_url": "external link"},
        covered_by_cleanup={"posts.file_path"},
    )


def test_stale_exclusion_fails() -> None:
    with pytest.raises(AssertionError, match="no longer exist"):
        assert_account_deletion_schema(
            _metadata(), "users", not_stored_files={"posts.gone": "why"},
        )


def test_blank_reason_fails() -> None:
    with pytest.raises(AssertionError, match="needs a reason"):
        assert_account_deletion_schema(
            _metadata("cover_url"), "users", not_stored_files={"posts.cover_url": " "},
        )
