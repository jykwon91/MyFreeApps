"""SQLAlchemy ORM model for ``screening_results``.

Per RENTALS_PLAN.md §5.3: one row per (applicant, screening request). The
partial UNIQUE on ``(applicant_id, provider) WHERE status = 'pending'``
prevents the host from accidentally firing two concurrent screening requests
to the same provider for the same applicant — once the first one completes
(status moves off ``'pending'``) a re-run is allowed.

``report_storage_key`` and ``adverse_action_snippet`` are NOT encrypted — the
report blob is stored opaquely in MinIO (encrypted at the bucket level), and
the adverse-action snippet is a regulator-facing summary the host needs to
see and forward.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.applicant_enums import (
    SCREENING_PROVIDERS_SQL,
    SCREENING_STATUSES_SQL,
)
from app.db.base import Base


class ScreeningResult(Base):
    __tablename__ = "screening_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    report_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    adverse_action_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    requested_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    completed_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"provider IN {SCREENING_PROVIDERS_SQL}",
            name="chk_screening_result_provider",
        ),
        CheckConstraint(
            f"status IN {SCREENING_STATUSES_SQL}",
            name="chk_screening_result_status",
        ),
        # "What's pending / completed for this applicant" lookup.
        Index(
            "ix_screening_results_applicant_status",
            "applicant_id", "status",
        ),
        # Partial UNIQUE: one in-flight screening request per (applicant, provider).
        # Once the first request completes, status moves off 'pending' and the
        # constraint no longer applies — a retry is allowed.
        Index(
            "uq_screening_results_applicant_provider_pending",
            "applicant_id", "provider",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )
