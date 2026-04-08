"""Tests for admin DB query and maintenance endpoints."""
import pytest

from app.repositories.db_admin_repo import _FORBIDDEN_KEYWORDS


class TestReadonlyQueryValidation:
    """Test that the SQL validation rejects unsafe queries."""

    def test_rejects_drop(self):
        assert _FORBIDDEN_KEYWORDS.search("DROP TABLE users")

    def test_rejects_delete(self):
        assert _FORBIDDEN_KEYWORDS.search("DELETE FROM transactions")

    def test_rejects_update(self):
        assert _FORBIDDEN_KEYWORDS.search("UPDATE transactions SET amount = 0")

    def test_rejects_insert(self):
        assert _FORBIDDEN_KEYWORDS.search("INSERT INTO transactions VALUES (1)")

    def test_rejects_alter(self):
        assert _FORBIDDEN_KEYWORDS.search("ALTER TABLE users ADD COLUMN foo TEXT")

    def test_rejects_truncate(self):
        assert _FORBIDDEN_KEYWORDS.search("TRUNCATE transactions")

    def test_allows_select(self):
        assert not _FORBIDDEN_KEYWORDS.search("SELECT * FROM transactions")

    def test_allows_select_with_join(self):
        assert not _FORBIDDEN_KEYWORDS.search(
            "SELECT t.id FROM transactions t JOIN properties p ON p.id = t.property_id"
        )

    def test_allows_select_with_subquery(self):
        assert not _FORBIDDEN_KEYWORDS.search(
            "SELECT * FROM transactions WHERE id IN (SELECT id FROM documents)"
        )

    def test_allows_select_with_aggregate(self):
        assert not _FORBIDDEN_KEYWORDS.search(
            "SELECT vendor, count(*), sum(amount) FROM transactions GROUP BY vendor"
        )

    def test_rejects_case_insensitive(self):
        assert _FORBIDDEN_KEYWORDS.search("drop table users")
        assert _FORBIDDEN_KEYWORDS.search("Delete From transactions")

    def test_rejects_update_in_subquery(self):
        assert _FORBIDDEN_KEYWORDS.search(
            "SELECT * FROM (UPDATE transactions SET amount = 0 RETURNING *) t"
        )
