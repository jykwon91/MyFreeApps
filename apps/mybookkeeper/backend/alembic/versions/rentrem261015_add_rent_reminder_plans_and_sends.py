"""add rent_reminder_plans + rent_reminder_sends (tenant rent reminders)

A plan says how one tenant is reminded that rent is due (weekly on a weekday,
or monthly on the charge's due date; email and/or SMS); the send log records
every reminder actually attempted, one row per (plan, due date, channel). The
UNIQUE on that triple is what makes the scheduler idempotent.

Purely additive — no existing table is touched.

Revision ID: rentrem261015
Revises: txnprop260919
Create Date: 2026-10-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "rentrem261015"
down_revision: Union[str, None] = "txnprop260919"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kept in lockstep with app/core/rent_reminder_enums.py.
_FREQUENCIES_SQL = "('weekly', 'monthly')"
_CHANNELS_SQL = "('email', 'sms')"
_STATUSES_SQL = "('queued', 'sent_to_phone', 'sent', 'delivered', 'failed')"
_EMAIL_STATUSES_SQL = "('queued', 'sent', 'failed')"
_PENDING_STATUSES_SQL = "('queued', 'sent_to_phone')"
_MAX_SEND_DAYS_BEFORE = 14


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        nullable=False,
        server_default=sa.text("gen_random_uuid()"),
    )


def _fk(name: str, target: str) -> sa.Column:
    return sa.Column(
        name,
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey(target, ondelete="CASCADE"),
        nullable=False,
    )


def _timestamp(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
    )


def upgrade() -> None:
    op.create_table(
        "rent_reminder_plans",
        _uuid_pk(),
        _fk("user_id", "users.id"),
        _fk("organization_id", "organizations.id"),
        _fk("applicant_id", "applicants.id"),
        sa.Column("frequency", sa.String(length=12), nullable=False),
        sa.Column("due_weekday", sa.SmallInteger(), nullable=True),
        sa.Column("send_days_before", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("send_time", sa.Time(), nullable=False, server_default=sa.text("'18:00:00'")),
        sa.Column(
            "timezone", sa.String(length=64), nullable=False, server_default="America/Chicago",
        ),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sms_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("amount_override", sa.Numeric(12, 2), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.CheckConstraint(
            f"frequency IN {_FREQUENCIES_SQL}", name="chk_rent_reminder_plan_frequency",
        ),
        sa.CheckConstraint(
            "(frequency = 'weekly' AND due_weekday IS NOT NULL) OR "
            "(frequency = 'monthly' AND due_weekday IS NULL)",
            name="chk_rent_reminder_plan_weekday_matches_frequency",
        ),
        sa.CheckConstraint(
            "due_weekday IS NULL OR (due_weekday >= 0 AND due_weekday <= 6)",
            name="chk_rent_reminder_plan_weekday_range",
        ),
        sa.CheckConstraint(
            f"send_days_before >= 0 AND send_days_before <= {_MAX_SEND_DAYS_BEFORE}",
            name="chk_rent_reminder_plan_send_days_range",
        ),
        sa.CheckConstraint(
            "amount_override IS NULL OR amount_override > 0",
            name="chk_rent_reminder_plan_override_positive",
        ),
    )
    op.create_index(
        "uq_rent_reminder_plans_applicant_live",
        "rent_reminder_plans",
        ["applicant_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_rent_reminder_plans_org_active",
        "rent_reminder_plans",
        ["organization_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "rent_reminder_sends",
        _uuid_pk(),
        _fk("plan_id", "rent_reminder_plans.id"),
        _fk("applicant_id", "applicants.id"),
        _fk("organization_id", "organizations.id"),
        _fk("user_id", "users.id"),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("channel", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        # Fernet ciphertext (EncryptedString) — unbounded so it never truncates.
        sa.Column("message_body", sa.String(), nullable=False),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("provider_message_id", sa.String(length=64), nullable=True),
        sa.Column("error_code", sa.String(length=120), nullable=True),
        _timestamp("created_at"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_alerted_at", sa.DateTime(timezone=True), nullable=True),
        _timestamp("updated_at"),
        sa.UniqueConstraint(
            "plan_id", "due_date", "channel", name="uq_rent_reminder_sends_plan_due_channel",
        ),
        sa.CheckConstraint(
            f"channel IN {_CHANNELS_SQL}", name="chk_rent_reminder_send_channel",
        ),
        sa.CheckConstraint(
            f"status IN {_STATUSES_SQL}", name="chk_rent_reminder_send_status",
        ),
        sa.CheckConstraint(
            f"channel = 'sms' OR status IN {_EMAIL_STATUSES_SQL}",
            name="chk_rent_reminder_send_status_matches_channel",
        ),
        sa.CheckConstraint("amount >= 0", name="chk_rent_reminder_send_amount_non_negative"),
    )
    op.create_index(
        "ix_rent_reminder_sends_applicant_created",
        "rent_reminder_sends",
        ["applicant_id", "created_at"],
    )
    op.create_index("ix_rent_reminder_sends_org", "rent_reminder_sends", ["organization_id"])
    op.create_index(
        "ix_rent_reminder_sends_provider_message_id",
        "rent_reminder_sends",
        ["provider_message_id"],
    )
    op.create_index(
        "ix_rent_reminder_sends_pending",
        "rent_reminder_sends",
        ["created_at"],
        postgresql_where=sa.text(f"status IN {_PENDING_STATUSES_SQL}"),
    )


def downgrade() -> None:
    op.drop_index("ix_rent_reminder_sends_pending", table_name="rent_reminder_sends")
    op.drop_index("ix_rent_reminder_sends_provider_message_id", table_name="rent_reminder_sends")
    op.drop_index("ix_rent_reminder_sends_org", table_name="rent_reminder_sends")
    op.drop_index("ix_rent_reminder_sends_applicant_created", table_name="rent_reminder_sends")
    op.drop_table("rent_reminder_sends")
    op.drop_index("ix_rent_reminder_plans_org_active", table_name="rent_reminder_plans")
    op.drop_index("uq_rent_reminder_plans_applicant_live", table_name="rent_reminder_plans")
    op.drop_table("rent_reminder_plans")
