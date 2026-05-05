"""documents: redesign table for Phase 2 CRUD

The original Phase-1 documents table was a lightweight stub with
``document_type`` (old enum), ``file_path NOT NULL``, ``generated_by``,
and ``version``.  Phase 2 replaces it with a full-featured design:

Changes:
- Drop old columns: ``document_type``, ``file_path``, ``parsed_text``,
  ``generated_by``, ``version``.
- Drop old constraints: ``chk_document_type``, ``chk_document_generated_by``,
  ``uq_document_app_type_version``, ``ix_document_app_type``.
- Add new columns: ``title``, ``kind``, ``body``, ``file_path`` (nullable now),
  ``filename``, ``content_type``, ``size_bytes``.
- Make ``application_id`` nullable (documents can exist pre-linking).
- Add new constraint: ``chk_document_kind`` with the Phase-2 kind values.
- Add new indexes: ``ix_document_user_kind``, ``ix_document_user_app``.

Revision ID: docs260504
Revises: resup260504
Create Date: 2026-05-04 23:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "docs260504"
down_revision: Union[str, None] = "resup260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop old indexes and constraints.
    op.drop_index("ix_document_app_type", table_name="documents")
    op.drop_index("uq_document_app_type_version", table_name="documents")
    op.drop_constraint("chk_document_type", "documents")
    op.drop_constraint("chk_document_generated_by", "documents")

    # 2. Drop old columns.
    op.drop_column("documents", "document_type")
    op.drop_column("documents", "parsed_text")
    op.drop_column("documents", "generated_by")
    op.drop_column("documents", "version")
    op.drop_column("documents", "file_path")

    # 3. Make application_id nullable (documents can exist before linking).
    op.alter_column("documents", "application_id", nullable=True)

    # 4. Add new columns.
    op.add_column(
        "documents",
        sa.Column("title", sa.String(255), nullable=False, server_default="Untitled"),
    )
    op.add_column(
        "documents",
        sa.Column("kind", sa.String(30), nullable=False, server_default="other"),
    )
    op.add_column(
        "documents",
        sa.Column("body", sa.Text, nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("file_path", sa.Text, nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("filename", sa.String(255), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("content_type", sa.String(100), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
    )

    # 5. Remove server defaults now that the column population is complete.
    op.alter_column("documents", "title", server_default=None)
    op.alter_column("documents", "kind", server_default=None)

    # 6. Add new check constraint.
    op.create_check_constraint(
        "chk_document_kind",
        "documents",
        "kind IN ('cover_letter','tailored_resume','job_description','portfolio','other')",
    )

    # 7. Add new indexes.
    op.create_index("ix_document_user_kind", "documents", ["user_id", "kind"])
    op.create_index("ix_document_user_app", "documents", ["user_id", "application_id"])


def downgrade() -> None:
    # Remove Phase-2 indexes and constraints.
    op.drop_index("ix_document_user_app", table_name="documents")
    op.drop_index("ix_document_user_kind", table_name="documents")
    op.drop_constraint("chk_document_kind", "documents")

    # Remove Phase-2 columns.
    op.drop_column("documents", "size_bytes")
    op.drop_column("documents", "content_type")
    op.drop_column("documents", "filename")
    op.drop_column("documents", "file_path")
    op.drop_column("documents", "body")
    op.drop_column("documents", "kind")
    op.drop_column("documents", "title")

    # Restore application_id to NOT NULL.
    op.alter_column("documents", "application_id", nullable=False)

    # Restore old columns.
    op.add_column(
        "documents",
        sa.Column(
            "document_type",
            sa.String(30),
            nullable=False,
            server_default="other",
        ),
    )
    op.add_column(
        "documents",
        sa.Column("parsed_text", sa.Text, nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column(
            "generated_by",
            sa.String(10),
            nullable=False,
            server_default="user",
        ),
    )
    op.add_column(
        "documents",
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
    )
    op.add_column(
        "documents",
        sa.Column("file_path", sa.Text, nullable=False, server_default=""),
    )

    # Restore old constraints.
    op.create_check_constraint(
        "chk_document_type",
        "documents",
        "document_type IN ('cover_letter','tailored_resume','offer_letter','screenshot','email_attachment','original_resume','other')",
    )
    op.create_check_constraint(
        "chk_document_generated_by",
        "documents",
        "generated_by IN ('user','claude','system')",
    )

    # Restore old indexes.
    op.create_index("ix_document_app_type", "documents", ["application_id", "document_type"])
    op.create_index(
        "uq_document_app_type_version",
        "documents",
        ["application_id", "document_type", "version"],
        unique=True,
    )
