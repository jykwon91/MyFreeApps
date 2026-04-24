"""Initial schema — all 15 tables

Revision ID: 0001
Revises:
Create Date: 2026-04-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("display_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("totp_secret_encrypted", sa.String(500), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("totp_recovery_codes", sa.String(1000), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ---------------------------------------------------------------- profiles
    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resume_file_path", sa.Text(), nullable=True),
        sa.Column("parsed_fields", postgresql.JSONB(), nullable=True),
        sa.Column("parser_version", sa.Text(), nullable=True),
        sa.Column("parsed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("work_auth_status", sa.String(30), nullable=False, server_default="unknown"),
        sa.Column("desired_salary_min", sa.Numeric(12, 2), nullable=True),
        sa.Column("desired_salary_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("salary_currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("salary_period", sa.String(10), nullable=False, server_default="annual"),
        sa.Column("locations", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("remote_preference", sa.String(20), nullable=False, server_default="any"),
        sa.Column("seniority", sa.String(20), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "work_auth_status IN ('citizen','permanent_resident','h1b','tn','opt','other','unknown')",
            name="chk_profile_work_auth_status",
        ),
        sa.CheckConstraint("salary_period IN ('annual','hourly','monthly')", name="chk_profile_salary_period"),
        sa.CheckConstraint("cardinality(locations) <= 10", name="chk_profile_locations_max"),
        sa.CheckConstraint("remote_preference IN ('remote_only','hybrid','onsite','any')", name="chk_profile_remote_preference"),
        sa.CheckConstraint(
            "seniority IS NULL OR seniority IN ('junior','mid','senior','staff','principal','manager','director','exec')",
            name="chk_profile_seniority",
        ),
    )
    op.create_index("uq_profile_user", "profiles", ["user_id"], unique=True)

    # ------------------------------------------------------------- work_history
    op.create_table(
        "work_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_name", sa.String(200), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("bullets", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("cardinality(bullets) <= 30", name="chk_work_history_bullets_max"),
    )
    op.create_index("ix_work_history_user_id", "work_history", ["user_id"])
    op.create_index("ix_work_history_profile_id", "work_history", ["profile_id"])

    # --------------------------------------------------------------- education
    op.create_table(
        "education",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school", sa.String(200), nullable=False),
        sa.Column("degree", sa.String(100), nullable=True),
        sa.Column("field", sa.String(100), nullable=True),
        sa.Column("start_year", sa.Integer(), nullable=True),
        sa.Column("end_year", sa.Integer(), nullable=True),
        sa.Column("gpa", sa.Numeric(3, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "start_year IS NULL OR (start_year >= 1950 AND start_year <= 2100)",
            name="chk_education_start_year",
        ),
        sa.CheckConstraint("end_year IS NULL OR end_year >= start_year", name="chk_education_end_year"),
    )
    op.create_index("ix_education_user_id", "education", ["user_id"])
    op.create_index("ix_education_profile_id", "education", ["profile_id"])

    # ------------------------------------------------------------------ skills
    op.create_table(
        "skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("years_experience", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "years_experience IS NULL OR (years_experience >= 0 AND years_experience < 70)",
            name="chk_skill_years_experience",
        ),
        sa.CheckConstraint(
            "category IS NULL OR category IN ('language','framework','tool','platform','soft')",
            name="chk_skill_category",
        ),
    )
    op.create_index("ix_skills_user_id", "skills", ["user_id"])
    op.create_index("ix_skills_profile_id", "skills", ["profile_id"])
    op.create_index("uq_skill_user_name", "skills", ["user_id", sa.text("lower(name)")], unique=True)

    # --------------------------------------------------------- screening_answers
    op.create_table(
        "screening_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_key", sa.String(80), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("is_eeoc", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_screening_answers_user_id", "screening_answers", ["user_id"])
    op.create_index("ix_screening_answers_profile_id", "screening_answers", ["profile_id"])
    op.create_index("uq_screening_answer", "screening_answers", ["user_id", "question_key"], unique=True)

    # --------------------------------------------------------------- companies
    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("primary_domain", sa.String(255), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(100), nullable=True),
        sa.Column("size_range", sa.String(20), nullable=True),
        sa.Column("hq_location", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("external_ref", sa.String(255), nullable=True),
        sa.Column("external_source", sa.String(50), nullable=True),
        sa.Column("crunchbase_id", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "size_range IS NULL OR size_range IN ('1-10','11-50','51-200','201-1000','1001-5000','5000+')",
            name="chk_company_size_range",
        ),
        sa.CheckConstraint(
            "primary_domain IS NULL OR primary_domain = lower(primary_domain)",
            name="chk_company_domain_lowercase",
        ),
    )
    op.create_index("ix_companies_user_id", "companies", ["user_id"])
    op.create_index(
        "uq_company_user_domain",
        "companies",
        ["user_id", sa.text("lower(primary_domain)")],
        unique=True,
        postgresql_where=sa.text("primary_domain IS NOT NULL"),
    )

    # --------------------------------------------------------- company_research
    op.create_table(
        "company_research",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("overall_sentiment", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("senior_engineer_sentiment", sa.Text(), nullable=True),
        sa.Column("interview_process", sa.Text(), nullable=True),
        sa.Column("red_flags", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("green_flags", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("reported_comp_range_min", sa.Numeric(12, 2), nullable=True),
        sa.Column("reported_comp_range_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("comp_currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("comp_confidence", sa.String(10), nullable=False, server_default="unknown"),
        sa.Column("raw_synthesis", postgresql.JSONB(), nullable=True),
        sa.Column("last_researched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "overall_sentiment IN ('positive','mixed','negative','unknown')",
            name="chk_company_research_sentiment",
        ),
        sa.CheckConstraint(
            "comp_confidence IN ('high','medium','low','unknown')",
            name="chk_company_research_comp_confidence",
        ),
        sa.CheckConstraint("cardinality(red_flags) <= 20", name="chk_company_research_red_flags_max"),
        sa.CheckConstraint("cardinality(green_flags) <= 20", name="chk_company_research_green_flags_max"),
    )
    op.create_index("ix_company_research_user_id", "company_research", ["user_id"])
    op.create_index("uq_company_research_company", "company_research", ["company_id"], unique=True)

    # --------------------------------------------------------- research_sources
    op.create_table(
        "research_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_research_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_research.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "source_type IN ('glassdoor','teamblind','reddit','levels','payscale','news','official','other')",
            name="chk_research_source_type",
        ),
    )
    op.create_index("ix_research_sources_user_id", "research_sources", ["user_id"])
    op.create_index("ix_research_sources_company_research_id", "research_sources", ["company_research_id"])
    op.create_index("ix_research_source_research", "research_sources", ["company_research_id", "fetched_at"])

    # ------------------------------------------------------------ applications
    op.create_table(
        "applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("role_title", sa.String(200), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("jd_text", sa.Text(), nullable=True),
        sa.Column("jd_parsed", postgresql.JSONB(), nullable=True),
        sa.Column("source", sa.String(20), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_salary_min", sa.Numeric(12, 2), nullable=True),
        sa.Column("posted_salary_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("posted_salary_currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("posted_salary_period", sa.String(10), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("remote_type", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("fit_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("external_ref", sa.String(255), nullable=True),
        sa.Column("external_source", sa.String(50), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "source IS NULL OR source IN ('indeed','linkedin','ziprecruiter','greenhouse','lever','workday','direct','referral','chrome_extension','other')",
            name="chk_application_source",
        ),
        sa.CheckConstraint(
            "posted_salary_period IS NULL OR posted_salary_period IN ('annual','hourly','monthly')",
            name="chk_application_salary_period",
        ),
        sa.CheckConstraint(
            "remote_type IN ('remote','hybrid','onsite','unknown')",
            name="chk_application_remote_type",
        ),
        sa.CheckConstraint(
            "fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100)",
            name="chk_application_fit_score",
        ),
    )
    op.create_index("ix_applications_user_id", "applications", ["user_id"])
    op.create_index("ix_applications_company_id", "applications", ["company_id"])
    op.create_index(
        "ix_application_user_archived_applied",
        "applications",
        ["user_id", "applied_at"],
        postgresql_where=sa.text("archived = false AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_application_user_role",
        "applications",
        ["user_id", "company_id", sa.text("lower(role_title)"), sa.text("coalesce(url, '')")],
        unique=True,
        postgresql_where=sa.text("archived = false AND deleted_at IS NULL"),
    )

    # -------------------------------------------------------- application_events
    op.create_table(
        "application_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("application_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("email_message_id", sa.String(255), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "event_type IN ('applied','email_received','interview_scheduled','interview_completed','rejected','offer_received','withdrawn','ghosted','note_added')",
            name="chk_appevent_event_type",
        ),
        sa.CheckConstraint(
            "source IN ('manual','gmail','calendar','extension','system')",
            name="chk_appevent_source",
        ),
    )
    op.create_index("ix_application_events_user_id", "application_events", ["user_id"])
    op.create_index("ix_application_events_application_id", "application_events", ["application_id"])
    op.create_index("ix_appevent_app_occurred", "application_events", ["application_id", "occurred_at"])
    op.create_index("ix_appevent_user_occurred", "application_events", ["user_id", "occurred_at"])
    op.create_index(
        "uq_appevent_user_msgid",
        "application_events",
        ["user_id", "email_message_id"],
        unique=True,
        postgresql_where=sa.text("email_message_id IS NOT NULL"),
    )

    # ------------------------------------------------------ application_contacts
    op.create_table(
        "application_contacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("application_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("linkedin_url", sa.Text(), nullable=True),
        sa.Column("role", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "role IS NULL OR role IN ('recruiter','hiring_manager','interviewer','referrer','other')",
            name="chk_appcontact_role",
        ),
    )
    op.create_index("ix_application_contacts_user_id", "application_contacts", ["user_id"])
    op.create_index("ix_application_contacts_application_id", "application_contacts", ["application_id"])

    # --------------------------------------------------------------- documents
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("application_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_type", sa.String(30), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("parsed_text", sa.Text(), nullable=True),
        sa.Column("generated_by", sa.String(10), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "document_type IN ('cover_letter','tailored_resume','offer_letter','screenshot','email_attachment','original_resume','other')",
            name="chk_document_type",
        ),
        sa.CheckConstraint(
            "generated_by IN ('user','claude','system')",
            name="chk_document_generated_by",
        ),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_documents_application_id", "documents", ["application_id"])
    op.create_index("ix_document_app_type", "documents", ["application_id", "document_type"])
    op.create_index("uq_document_app_type_version", "documents", ["application_id", "document_type", "version"], unique=True)

    # ---------------------------------------------------- job_board_credentials
    op.create_table(
        "job_board_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("board", sa.String(30), nullable=False),
        sa.Column("encrypted_credentials", sa.LargeBinary(), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "board IN ('linkedin','indeed','ziprecruiter','greenhouse','lever','workday','other')",
            name="chk_jbc_board",
        ),
    )
    op.create_index("ix_job_board_credentials_user_id", "job_board_credentials", ["user_id"])
    op.create_index("uq_jbc_user_board", "job_board_credentials", ["user_id", "board"], unique=True)

    # --------------------------------------------------------- resume_upload_jobs
    op.create_table(
        "resume_upload_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("result_parsed_fields", postgresql.JSONB(), nullable=True),
        sa.Column("parser_version", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('queued','processing','complete','failed','cancelled')",
            name="chk_resume_job_status",
        ),
    )
    op.create_index("ix_resume_upload_jobs_user_id", "resume_upload_jobs", ["user_id"])
    op.create_index("ix_resume_upload_jobs_profile_id", "resume_upload_jobs", ["profile_id"])

    # ----------------------------------------------------------- extraction_logs
    op.create_table(
        "extraction_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("context_type", sa.String(30), nullable=False),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=True),
        sa.Column("cache_write_tokens", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "context_type IN ('resume_parse','jd_parse','company_research','cover_letter','resume_tailor','email_classify','other')",
            name="chk_extraction_log_context_type",
        ),
        sa.CheckConstraint(
            "status IN ('success','error','partial')",
            name="chk_extraction_log_status",
        ),
    )
    op.create_index("ix_extraction_logs_user_id", "extraction_logs", ["user_id"])


def downgrade() -> None:
    op.drop_table("extraction_logs")
    op.drop_table("resume_upload_jobs")
    op.drop_table("job_board_credentials")
    op.drop_table("documents")
    op.drop_table("application_contacts")
    op.drop_table("application_events")
    op.drop_table("applications")
    op.drop_table("research_sources")
    op.drop_table("company_research")
    op.drop_table("companies")
    op.drop_table("screening_answers")
    op.drop_table("skills")
    op.drop_table("education")
    op.drop_table("work_history")
    op.drop_table("profiles")
    op.drop_table("users")
