import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Embedding dimensionality — see app/models/discovery/discovered_job.py
# and ``app.services.discovery.discovery_embedding_service``. Both
# tables share the same model + dim so the score loop can compute
# cosine similarity directly.
_EMBED_DIMS = 384


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    resume_file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    parser_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    work_auth_status: Mapped[str] = mapped_column(String(30), default="unknown")
    desired_salary_min: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    desired_salary_max: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_currency: Mapped[str] = mapped_column(String(3), default="USD")
    salary_period: Mapped[str] = mapped_column(String(10), default="annual")

    locations: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        default=list,
        server_default="{}",
    )
    remote_preference: Mapped[str] = mapped_column(String(20), default="any")
    seniority: Mapped[str | None] = mapped_column(String(20), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Per-operator defaults for the New Saved Search dialog. Loose
    # JSONB so the frontend can evolve keys faster than migrations.
    # Phase B of /discover. Phase C reads preferred_industries /
    # preferred_stack / rejected_stack as scoring inputs.
    discovery_defaults: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=func.jsonb_build_object(),
    )

    # Embedding columns (PR 4a). Refreshed by
    # ``discovery_embedding_service.refresh_profile_embedding`` whenever
    # match-relevant profile fields change (skills, work_history,
    # resume). PR 4b uses this vector as the query side of cosine
    # similarity against ``discovered_jobs.embedding``.
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(_EMBED_DIMS), nullable=True,
    )
    embedding_model: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
    )
    embedded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    work_history: Mapped[list["WorkHistory"]] = relationship("WorkHistory", back_populates="profile", cascade="all, delete-orphan")
    education: Mapped[list["Education"]] = relationship("Education", back_populates="profile", cascade="all, delete-orphan")
    skills: Mapped[list["Skill"]] = relationship("Skill", back_populates="profile", cascade="all, delete-orphan")
    screening_answers: Mapped[list["ScreeningAnswer"]] = relationship("ScreeningAnswer", back_populates="profile", cascade="all, delete-orphan")
    resume_upload_jobs: Mapped[list["ResumeUploadJob"]] = relationship("ResumeUploadJob", back_populates="profile", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "work_auth_status IN ('citizen','permanent_resident','h1b','tn','opt','other','unknown')",
            name="chk_profile_work_auth_status",
        ),
        CheckConstraint(
            "salary_period IN ('annual','hourly','monthly')",
            name="chk_profile_salary_period",
        ),
        CheckConstraint(
            "cardinality(locations) <= 10",
            name="chk_profile_locations_max",
        ),
        CheckConstraint(
            "remote_preference IN ('remote_only','hybrid','onsite','any')",
            name="chk_profile_remote_preference",
        ),
        CheckConstraint(
            "seniority IS NULL OR seniority IN ('junior','mid','senior','staff','principal','manager','director','exec')",
            name="chk_profile_seniority",
        ),
        Index("uq_profile_user", "user_id", unique=True),
    )
