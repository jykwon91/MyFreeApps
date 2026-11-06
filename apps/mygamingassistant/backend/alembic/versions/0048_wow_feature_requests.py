"""Add wow_feature_story / wow_feature_submission / wow_feature_vote

Revision ID: 0048
Revises: 0047
Create Date: 2026-11-06 00:00:00.000000

WHY. WoW Forever visitors (no accounts) can request features. Claude refines
each request into a user story (``wow_feature_story``, created PRIVATE in
status ``submitted``); triage approves it onto the public board. The raw
request lives in ``wow_feature_submission`` (PRIVATE, retention-purged) and
"me too" votes in ``wow_feature_vote`` (HMAC keys only — never a raw IP or
browser id). See ``app/models/wow/feature_*.py``. All three start empty.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0048"
down_revision: Union[str, None] = "0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of app/core/wow_feature_request_enums.py, as SQL.
_STATUSES = "('submitted', 'open', 'planned', 'in_progress', 'shipped', 'not_planned', 'duplicate')"
_PUBLIC_STATUSES = "('open', 'planned', 'in_progress', 'shipped', 'not_planned')"
_AREAS = (
    "('map_travel', 'leveling_quests', 'professions', 'food_consumables', 'gold_economy', "
    "'gear_upgrades', 'class_guides', 'dungeons_raids', 'pvp', 'site_app')"
)
_FEASIBILITIES = "('feasible', 'needs_data', 'not_possible')"
_VERDICTS = "('new', 'duplicate', 'needs_clarification', 'rejected')"
_CLASSES = (
    "('druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', "
    "'warrior', 'undecided')"
)
_EXPERIENCES = "('new', 'returning', 'veteran')"
_LEVEL_BANDS = (
    "('1-10', '11-20', '21-30', '31-40', '41-50', '51-59', '60-fresh', '60-raiding', 'not-playing')"
)
_FACTIONS = "('alliance', 'horde', 'undecided')"
_VOTE_SOURCES = "('vote', 'submission')"
_PUBLIC_VISIBLE = f"hidden_at IS NULL AND status IN {_PUBLIC_STATUSES}"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
    )


def upgrade() -> None:
    op.create_table(
        "wow_feature_story",
        _uuid_pk(),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("persona", sa.String(120), nullable=False),
        sa.Column("i_want", sa.String(300), nullable=False),
        sa.Column("so_that", sa.String(300), nullable=False),
        sa.Column("acceptance_criteria", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("follow_ups", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("area", sa.String(30), nullable=False),
        sa.Column("topic", sa.String(30), nullable=True),
        sa.Column("feasibility", sa.String(20), nullable=False),
        sa.Column("feasibility_note", sa.String(300), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="submitted"),
        sa.Column("priority", sa.SmallInteger(), nullable=True),
        sa.Column("operator_note", sa.String(1000), nullable=True),
        sa.Column("shipped_path", sa.String(200), nullable=True),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "merged_into_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wow_feature_story.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("vote_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(f"status IN {_STATUSES}", name="ck_wowfeaturestory_status"),
        sa.CheckConstraint(f"area IN {_AREAS}", name="ck_wowfeaturestory_area"),
        sa.CheckConstraint(f"feasibility IN {_FEASIBILITIES}", name="ck_wowfeaturestory_feasibility"),
        sa.CheckConstraint("priority IS NULL OR priority BETWEEN 1 AND 3", name="ck_wowfeaturestory_priority"),
        sa.CheckConstraint(
            "shipped_path IS NULL OR shipped_path ~ '^/wow-forever(/|\\?|$)'",
            name="ck_wowfeaturestory_shipped_path",
        ),
        sa.CheckConstraint(
            "(status = 'duplicate') = (merged_into_id IS NOT NULL)", name="ck_wowfeaturestory_merged_status"
        ),
        sa.CheckConstraint("merged_into_id <> id", name="ck_wowfeaturestory_not_self_merged"),
        sa.CheckConstraint("vote_count >= 0", name="ck_wowfeaturestory_vote_count"),
        sa.CheckConstraint(
            "jsonb_typeof(acceptance_criteria) = 'array'", name="ck_wowfeaturestory_criteria_array"
        ),
        sa.CheckConstraint("jsonb_typeof(follow_ups) = 'array'", name="ck_wowfeaturestory_follow_ups_array"),
    )
    op.create_index("ix_wow_feature_story_merged_into_id", "wow_feature_story", ["merged_into_id"])
    op.create_index(
        "ix_wowfeaturestory_public_area_top",
        "wow_feature_story",
        ["area", sa.text("vote_count DESC"), sa.text("created_at DESC")],
        postgresql_where=sa.text(_PUBLIC_VISIBLE),
    )
    op.create_index(
        "ix_wowfeaturestory_public_area_new",
        "wow_feature_story",
        ["area", sa.text("created_at DESC")],
        postgresql_where=sa.text(_PUBLIC_VISIBLE),
    )
    op.create_index(
        "ix_wowfeaturestory_public_top",
        "wow_feature_story",
        [sa.text("vote_count DESC"), sa.text("created_at DESC")],
        postgresql_where=sa.text(_PUBLIC_VISIBLE),
    )

    op.create_table(
        "wow_feature_submission",
        _uuid_pk(),
        sa.Column("raw_text", sa.String(1000), nullable=True),
        sa.Column("clarification_answer", sa.String(500), nullable=True),
        sa.Column(
            "parent_submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wow_feature_submission.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("class_id", sa.String(20), nullable=True),
        sa.Column("experience", sa.String(20), nullable=True),
        sa.Column("level_band", sa.String(20), nullable=True),
        sa.Column("professions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("activities", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("faction", sa.String(20), nullable=True),
        sa.Column("text_fingerprint", sa.String(64), nullable=False),
        sa.Column("verdict", sa.String(30), nullable=False),
        sa.Column(
            "story_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wow_feature_story.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("nuance_note", sa.String(300), nullable=True),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.Column("model_id", sa.String(80), nullable=True),
        sa.Column("ip_hash", sa.String(64), nullable=True),
        sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(f"verdict IN {_VERDICTS}", name="ck_wowfeaturesubmission_verdict"),
        sa.CheckConstraint(
            "(verdict IN ('new', 'duplicate')) = (story_id IS NOT NULL)",
            name="ck_wowfeaturesubmission_story_link",
        ),
        sa.CheckConstraint(
            "raw_text IS NULL OR char_length(raw_text) BETWEEN 10 AND 1000",
            name="ck_wowfeaturesubmission_raw_text_length",
        ),
        sa.CheckConstraint(f"class_id IS NULL OR class_id IN {_CLASSES}", name="ck_wowfeaturesubmission_class"),
        sa.CheckConstraint(
            f"experience IS NULL OR experience IN {_EXPERIENCES}", name="ck_wowfeaturesubmission_experience"
        ),
        sa.CheckConstraint(
            f"level_band IS NULL OR level_band IN {_LEVEL_BANDS}", name="ck_wowfeaturesubmission_level_band"
        ),
        sa.CheckConstraint(f"faction IS NULL OR faction IN {_FACTIONS}", name="ck_wowfeaturesubmission_faction"),
        sa.CheckConstraint("jsonb_typeof(professions) = 'array'", name="ck_wowfeaturesubmission_professions"),
        sa.CheckConstraint("jsonb_typeof(activities) = 'array'", name="ck_wowfeaturesubmission_activities"),
    )
    op.create_index(
        "ix_wow_feature_submission_parent_submission_id", "wow_feature_submission", ["parent_submission_id"]
    )
    op.create_index("ix_wow_feature_submission_story_id", "wow_feature_submission", ["story_id"])
    op.create_index(
        "ix_wow_feature_submission_text_fingerprint", "wow_feature_submission", ["text_fingerprint"]
    )
    op.create_index(
        "ix_wowfeaturesubmission_inbox",
        "wow_feature_submission",
        ["created_at"],
        postgresql_where=sa.text("triaged_at IS NULL"),
    )
    op.create_index(
        "ix_wowfeaturesubmission_verdict_created", "wow_feature_submission", ["verdict", "created_at"]
    )

    op.create_table(
        "wow_feature_vote",
        _uuid_pk(),
        sa.Column(
            "story_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wow_feature_story.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("voter_key", sa.String(64), nullable=False),
        sa.Column("ip_hash", sa.String(64), nullable=True),
        sa.Column("source", sa.String(20), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("story_id", "voter_key", name="uq_wowfeaturevote_story_voter"),
        sa.CheckConstraint(f"source IN {_VOTE_SOURCES}", name="ck_wowfeaturevote_source"),
        sa.CheckConstraint("char_length(voter_key) = 64", name="ck_wowfeaturevote_voter_key_length"),
    )
    op.create_index("ix_wowfeaturevote_voter_key", "wow_feature_vote", ["voter_key"])
    op.create_index("ix_wowfeaturevote_story_ip", "wow_feature_vote", ["story_id", "ip_hash"])


def downgrade() -> None:
    op.drop_index("ix_wowfeaturevote_story_ip", table_name="wow_feature_vote")
    op.drop_index("ix_wowfeaturevote_voter_key", table_name="wow_feature_vote")
    op.drop_table("wow_feature_vote")
    op.drop_index("ix_wowfeaturesubmission_verdict_created", table_name="wow_feature_submission")
    op.drop_index("ix_wowfeaturesubmission_inbox", table_name="wow_feature_submission")
    op.drop_index("ix_wow_feature_submission_text_fingerprint", table_name="wow_feature_submission")
    op.drop_index("ix_wow_feature_submission_story_id", table_name="wow_feature_submission")
    op.drop_index("ix_wow_feature_submission_parent_submission_id", table_name="wow_feature_submission")
    op.drop_table("wow_feature_submission")
    op.drop_index("ix_wowfeaturestory_public_top", table_name="wow_feature_story")
    op.drop_index("ix_wowfeaturestory_public_area_new", table_name="wow_feature_story")
    op.drop_index("ix_wowfeaturestory_public_area_top", table_name="wow_feature_story")
    op.drop_index("ix_wow_feature_story_merged_into_id", table_name="wow_feature_story")
    op.drop_table("wow_feature_story")
