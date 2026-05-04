"""resume_upload_jobs: add file metadata columns

The Phase 2 upload endpoint stores file bytes in MinIO and writes the
object key to ``file_path``. We also surface filename / content type /
size on the job row for the UI listing — saves a presigned-URL
round-trip per row when displaying status.

Revision ID: resup260504
Revises: totp260503
Create Date: 2026-05-04 22:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "resup260504"
down_revision: Union[str, None] = "totp260503"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "resume_upload_jobs",
        sa.Column("file_filename", sa.String(255), nullable=True),
    )
    op.add_column(
        "resume_upload_jobs",
        sa.Column("file_content_type", sa.String(100), nullable=True),
    )
    op.add_column(
        "resume_upload_jobs",
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("resume_upload_jobs", "file_size_bytes")
    op.drop_column("resume_upload_jobs", "file_content_type")
    op.drop_column("resume_upload_jobs", "file_filename")
