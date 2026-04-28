"""Regression guard for critical indexes on the Applicants domain.

The partial index ``ix_applicants_user_pending_purge`` is required for the
RENTALS_PLAN.md §6.6 retention worker to scan for purge-eligible rows
without a sequential table scan. This test confirms the model declares the
index AND the migration script creates it — losing either is a silent
performance regression that won't show until production data volume grows.

We verify against the SQLAlchemy metadata + raw migration source rather
than ``pg_indexes`` because the test fixture uses SQLite (postgres-only
partial-index syntax doesn't apply).
"""
from __future__ import annotations

import re
from pathlib import Path

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.applicants.reference import Reference
from app.models.applicants.screening_result import ScreeningResult
from app.models.applicants.video_call_note import VideoCallNote


MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic" / "versions"
    / "f8h0i3k5l7m9_add_applicants_domain.py"
)


def _migration_source() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8")


def _model_index_names(model: type) -> set[str]:
    return {ix.name for ix in model.__table__.indexes}


def test_migration_file_exists() -> None:
    assert MIGRATION_PATH.exists(), (
        f"Expected applicants migration at {MIGRATION_PATH}. "
        "PR 3.1a relies on this exact filename — renaming requires updating "
        "test_applicant_indexes.py too."
    )


class TestApplicantIndexes:
    def test_orm_declares_pipeline_stage_active_index(self) -> None:
        assert "ix_applicants_org_stage_active" in _model_index_names(Applicant)

    def test_orm_declares_pipeline_sort_index(self) -> None:
        assert "ix_applicants_org_created_active" in _model_index_names(Applicant)

    def test_orm_declares_org_inquiry_index(self) -> None:
        assert "ix_applicants_org_inquiry" in _model_index_names(Applicant)

    def test_orm_declares_purge_scan_index(self) -> None:
        """Per RENTALS_PLAN.md §6.6 — without this, the retention worker
        does a full-table scan every cycle."""
        assert "ix_applicants_user_pending_purge" in _model_index_names(Applicant)

    def test_migration_creates_purge_scan_index_with_correct_predicate(self) -> None:
        """The partial index predicate is what makes the worker efficient.
        Lock the predicate text in so a future migration edit can't widen it
        (which would defeat the partial-index optimization)."""
        source = _migration_source()
        assert "ix_applicants_user_pending_purge" in source
        # The WHERE clause must mention BOTH conditions — regression-prone.
        assert re.search(
            r'deleted_at IS NOT NULL\s+AND\s+sensitive_purged_at IS NULL',
            source,
        ), "purge-scan partial index must be predicated on (deleted_at IS NOT NULL AND sensitive_purged_at IS NULL)"


class TestScreeningResultIndexes:
    def test_orm_declares_pending_unique(self) -> None:
        assert "uq_screening_results_applicant_provider_pending" in _model_index_names(ScreeningResult)

    def test_migration_creates_pending_unique_predicate(self) -> None:
        source = _migration_source()
        assert "uq_screening_results_applicant_provider_pending" in source
        assert "status = 'pending'" in source, (
            "screening-results partial UNIQUE must be predicated on status='pending' "
            "(allows re-runs once the first request completes)"
        )


class TestReferenceIndexes:
    def test_table_name_is_applicant_references_not_reserved_word(self) -> None:
        """The table is named ``applicant_references`` — using the SQL
        reserved word ``references`` makes dump/restore tooling and query
        logs harder to read. Locked here as a regression guard."""
        assert Reference.__tablename__ == "applicant_references"


class TestVideoCallNoteIndexes:
    def test_orm_declares_applicant_scheduled_index(self) -> None:
        assert "ix_video_call_notes_applicant_scheduled" in _model_index_names(VideoCallNote)

    def test_migration_creates_descending_scheduled_index(self) -> None:
        source = _migration_source()
        # Migration uses raw SQL for DESC ordering.
        assert "ix_video_call_notes_applicant_scheduled" in source
        assert "scheduled_at DESC" in source, (
            "video_call_notes timeline index must be DESC for newest-first ordering"
        )


class TestApplicantEventIndexes:
    def test_orm_declares_applicant_timeline_index(self) -> None:
        assert "ix_applicant_events_applicant_occurred" in _model_index_names(ApplicantEvent)

    def test_orm_declares_funnel_aggregation_index(self) -> None:
        assert "ix_applicant_events_type_occurred" in _model_index_names(ApplicantEvent)

    def test_migration_creates_descending_occurred_index(self) -> None:
        source = _migration_source()
        assert "ix_applicant_events_applicant_occurred" in source
        assert "occurred_at DESC" in source
