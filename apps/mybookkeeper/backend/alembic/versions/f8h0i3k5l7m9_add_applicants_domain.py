"""add applicants domain (applicants, screening_results, applicant_references,
video_call_notes, applicant_events)

Revision ID: f8h0i3k5l7m9
Revises: e7g9h2j4k6l8
Create Date: 2026-04-27

Phase 3 / PR 3.1a of the rentals expansion. See RENTALS_PLAN.md §5.3, §8.1-8.7.

Conventions per RENTALS_PLAN.md §4.1 (mirrors the inquiries migration in
``d6f8b1a2c4e5_add_inquiries_domain.py``):

- String + CheckConstraint for stage / provider / status / actor /
  relationship columns (not SAEnum).
- Dual scope: ``organization_id + user_id`` on the parent (``applicants``);
  child tables scope through their applicant FK.
- Soft-delete via ``deleted_at`` on the parent only — children are
  immutable / cascade-deleted.
- ``DateTime(timezone=True)`` with ``server_default = func.now()``.
- UUID primary keys (``uuid.uuid4`` Python-side default).
- Append-only event log (``applicant_events``) has no ``updated_at``.
- PII columns (``legal_name``, ``dob``, ``employer_or_hospital``,
  ``vehicle_make_model``, ``reference_name``, ``reference_contact``,
  ``video_call_notes.notes``) are stored as Fernet ciphertext via the
  ``EncryptedString`` SQLAlchemy ``TypeDecorator``. The DB stores plain
  TEXT — no DDL difference from any other String column.
- ``key_version smallint`` lets future key rotation re-encrypt rows
  non-destructively per RENTALS_PLAN.md §8.2.
- Table name ``applicant_references`` (not ``references``) avoids the SQL
  reserved keyword in dump/restore tooling and query logs.
- ``applicants.inquiry_id`` is ``ON DELETE SET NULL`` — applicants outlive
  inquiry purges. Other FKs are ``ON DELETE CASCADE``.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f8h0i3k5l7m9"
down_revision: Union[str, None] = "e7g9h2j4k6l8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # applicants
    # ------------------------------------------------------------------
    op.create_table(
        "applicants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=True),
        # PII — stored as TEXT, encrypted application-side via EncryptedString.
        sa.Column("legal_name", sa.Text(), nullable=True),
        sa.Column("dob", sa.Text(), nullable=True),
        sa.Column("employer_or_hospital", sa.Text(), nullable=True),
        sa.Column("vehicle_make_model", sa.Text(), nullable=True),
        # Opaque MinIO key — NOT encrypted.
        sa.Column("id_document_storage_key", sa.String(length=500), nullable=True),
        sa.Column("contract_start", sa.Date(), nullable=True),
        sa.Column("contract_end", sa.Date(), nullable=True),
        sa.Column("smoker", sa.Boolean(), nullable=True),
        sa.Column("pets", sa.Text(), nullable=True),
        sa.Column("referred_by", sa.String(length=255), nullable=True),
        sa.Column("stage", sa.String(length=40), nullable=False, server_default="lead"),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sensitive_purged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
            name="fk_applicants_organization_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_applicants_user_id",
        ),
        sa.ForeignKeyConstraint(
            ["inquiry_id"], ["inquiries.id"], ondelete="SET NULL",
            name="fk_applicants_inquiry_id",
        ),
        sa.CheckConstraint(
            "stage IN ('lead', 'screening_pending', 'screening_passed', "
            "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
            "'lease_signed', 'declined')",
            name="chk_applicant_stage",
        ),
    )
    op.create_index("ix_applicants_organization_id", "applicants", ["organization_id"])
    op.create_index("ix_applicants_user_id", "applicants", ["user_id"])
    op.create_index("ix_applicants_inquiry_id", "applicants", ["inquiry_id"])
    op.create_index(
        "ix_applicants_org_stage_active",
        "applicants",
        ["organization_id", "stage"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_applicants_org_created_active",
        "applicants",
        ["organization_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_applicants_org_inquiry",
        "applicants",
        ["organization_id", "inquiry_id"],
    )
    # Retention purge worker scan (RENTALS_PLAN.md §6.6).
    op.create_index(
        "ix_applicants_user_pending_purge",
        "applicants",
        ["user_id", "deleted_at"],
        postgresql_where=sa.text(
            "deleted_at IS NOT NULL AND sensitive_purged_at IS NULL",
        ),
    )

    # ------------------------------------------------------------------
    # screening_results
    # ------------------------------------------------------------------
    op.create_table(
        "screening_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("report_storage_key", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("adverse_action_snippet", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["applicant_id"], ["applicants.id"], ondelete="CASCADE",
            name="fk_screening_results_applicant_id",
        ),
        sa.CheckConstraint(
            "provider IN ('keycheck', 'rentspree', 'other')",
            name="chk_screening_result_provider",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'pass', 'fail', 'inconclusive')",
            name="chk_screening_result_status",
        ),
    )
    op.create_index(
        "ix_screening_results_applicant_id", "screening_results", ["applicant_id"],
    )
    op.create_index(
        "ix_screening_results_applicant_status",
        "screening_results",
        ["applicant_id", "status"],
    )
    # Partial UNIQUE: prevents two concurrent pending screenings for the same
    # (applicant, provider). Once status moves off 'pending' a retry is allowed.
    op.create_index(
        "uq_screening_results_applicant_provider_pending",
        "screening_results",
        ["applicant_id", "provider"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    # ------------------------------------------------------------------
    # applicant_references
    # ------------------------------------------------------------------
    op.create_table(
        "applicant_references",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("relationship", sa.String(length=40), nullable=False),
        # PII — stored as TEXT, encrypted application-side.
        sa.Column("reference_name", sa.Text(), nullable=False),
        sa.Column("reference_contact", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("contacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["applicant_id"], ["applicants.id"], ondelete="CASCADE",
            name="fk_applicant_references_applicant_id",
        ),
        sa.CheckConstraint(
            "relationship IN ('landlord', 'employer', 'personal', "
            "'professional', 'family', 'other')",
            name="chk_applicant_reference_relationship",
        ),
    )
    # FK index — matches the ``index=True`` declaration on the model column.
    op.create_index(
        "ix_applicant_references_applicant_id",
        "applicant_references",
        ["applicant_id"],
    )

    # ------------------------------------------------------------------
    # video_call_notes
    # ------------------------------------------------------------------
    op.create_table(
        "video_call_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        # PII — stored as TEXT, encrypted application-side.
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("gut_rating", sa.SmallInteger(), nullable=True),
        sa.Column("transcript_storage_key", sa.String(length=500), nullable=True),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["applicant_id"], ["applicants.id"], ondelete="CASCADE",
            name="fk_video_call_notes_applicant_id",
        ),
        sa.CheckConstraint(
            "gut_rating IS NULL OR (gut_rating BETWEEN 1 AND 5)",
            name="chk_video_call_note_gut_rating",
        ),
    )
    op.create_index(
        "ix_video_call_notes_applicant_id", "video_call_notes", ["applicant_id"],
    )
    op.execute(
        "CREATE INDEX ix_video_call_notes_applicant_scheduled "
        "ON video_call_notes (applicant_id, scheduled_at DESC)",
    )

    # ------------------------------------------------------------------
    # applicant_events  (append-only — no updated_at)
    # ------------------------------------------------------------------
    op.create_table(
        "applicant_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("actor", sa.String(length=20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["applicant_id"], ["applicants.id"], ondelete="CASCADE",
            name="fk_applicant_events_applicant_id",
        ),
        sa.CheckConstraint(
            "event_type IN ('lead', 'screening_pending', 'screening_passed', "
            "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
            "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
            "'screening_completed', 'reference_contacted')",
            name="chk_applicant_event_type",
        ),
        sa.CheckConstraint(
            "actor IN ('host', 'system', 'applicant')",
            name="chk_applicant_event_actor",
        ),
    )
    op.create_index(
        "ix_applicant_events_applicant_id", "applicant_events", ["applicant_id"],
    )
    op.execute(
        "CREATE INDEX ix_applicant_events_applicant_occurred "
        "ON applicant_events (applicant_id, occurred_at DESC)",
    )
    op.create_index(
        "ix_applicant_events_type_occurred",
        "applicant_events",
        ["event_type", "occurred_at"],
    )


def downgrade() -> None:
    # Drop in reverse dependency order: children first, then parent.
    op.drop_index("ix_applicant_events_type_occurred", table_name="applicant_events")
    op.drop_index("ix_applicant_events_applicant_occurred", table_name="applicant_events")
    op.drop_index("ix_applicant_events_applicant_id", table_name="applicant_events")
    op.drop_table("applicant_events")

    op.drop_index("ix_video_call_notes_applicant_scheduled", table_name="video_call_notes")
    op.drop_index("ix_video_call_notes_applicant_id", table_name="video_call_notes")
    op.drop_table("video_call_notes")

    op.drop_index("ix_applicant_references_applicant_id", table_name="applicant_references")
    op.drop_table("applicant_references")

    op.drop_index(
        "uq_screening_results_applicant_provider_pending",
        table_name="screening_results",
    )
    op.drop_index(
        "ix_screening_results_applicant_status", table_name="screening_results",
    )
    op.drop_index(
        "ix_screening_results_applicant_id", table_name="screening_results",
    )
    op.drop_table("screening_results")

    op.drop_index("ix_applicants_user_pending_purge", table_name="applicants")
    op.drop_index("ix_applicants_org_inquiry", table_name="applicants")
    op.drop_index("ix_applicants_org_created_active", table_name="applicants")
    op.drop_index("ix_applicants_org_stage_active", table_name="applicants")
    op.drop_index("ix_applicants_inquiry_id", table_name="applicants")
    op.drop_index("ix_applicants_user_id", table_name="applicants")
    op.drop_index("ix_applicants_organization_id", table_name="applicants")
    op.drop_table("applicants")
