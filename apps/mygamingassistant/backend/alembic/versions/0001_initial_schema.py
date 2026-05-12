"""Initial schema — user + game taxonomy + lineup tables

Revision ID: 0001
Revises:
Create Date: 2026-05-12 00:00:00.000000
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
    # ------------------------------------------------------------------ user
    # Singular table name — mirrors MBK convention (not MJH's "users").
    op.create_table(
        "user",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("display_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("totp_secret", sa.String(500), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("totp_recovery_codes", sa.String(1000), nullable=True),
        sa.Column("totp_algorithm", sa.String(10), nullable=False, server_default="sha1"),
        sa.Column("failed_login_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failed_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('user','admin','superuser')",
            name="ck_user_role",
        ),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    # ---------------------------------------------------------------- audit_log
    op.create_table(
        "audit_log",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("operation", sa.String(10), nullable=False),
        sa.Column("row_id", sa.Text(), nullable=True),
        sa.Column("old_values", postgresql.JSONB(), nullable=True),
        sa.Column("new_values", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])

    # -------------------------------------------------------------- auth_event
    op.create_table(
        "auth_event",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # No FK to user — events survive account deletion (intentional).
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_auth_event_user_id", "auth_event", ["user_id"])
    op.create_index("ix_auth_event_event_type", "auth_event", ["event_type"])
    op.create_index("ix_auth_event_created_at", "auth_event", ["created_at"])

    # -------------------------------------------------------------------- game
    op.create_table(
        "game",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("side_a_label", sa.String(50), nullable=False),
        sa.Column("side_b_label", sa.String(50), nullable=False),
    )
    op.create_index("ix_game_slug", "game", ["slug"], unique=True)

    # --------------------------------------------------------------- map
    op.create_table(
        "map",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "game_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("minimap_url", sa.String(500), nullable=True),
        sa.Column("minimap_calibration_json", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("game_id", "slug", name="uq_map_game_slug"),
    )
    op.create_index("ix_map_game_id", "map", ["game_id"])

    # ----------------------------------------------------------------- map_zone
    op.create_table(
        "map_zone",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "map_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("polygon_points", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.UniqueConstraint("map_id", "slug", name="uq_map_zone_map_slug"),
    )
    op.create_index("ix_map_zone_map_id", "map_zone", ["map_id"])

    # -------------------------------------------------------------------- site
    op.create_table(
        "site",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "map_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.UniqueConstraint("map_id", "slug", name="uq_site_map_slug"),
    )
    op.create_index("ix_site_map_id", "site", ["map_id"])

    # ------------------------------------------------------------ utility_type
    op.create_table(
        "utility_type",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "game_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.UniqueConstraint("game_id", "slug", name="uq_utility_type_game_slug"),
    )
    op.create_index("ix_utility_type_game_id", "utility_type", ["game_id"])

    # ------------------------------------------------------------------ source
    op.create_table(
        "source",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("config_json", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "kind IN ('youtube_playlist','youtube_channel','manual')",
            name="ck_source_kind",
        ),
    )

    # ------------------------------------------------------------------ lineup
    op.create_table(
        "lineup",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "game_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "map_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "target_zone_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map_zone.id", ondelete="RESTRICT"), nullable=False,
        ),
        sa.Column(
            "stand_zone_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map_zone.id", ondelete="RESTRICT"), nullable=False,
        ),
        sa.Column("side", sa.String(10), nullable=False),
        sa.Column(
            "utility_type_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("utility_type.id", ondelete="RESTRICT"), nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("stand_screenshot_url", sa.String(500), nullable=True),
        sa.Column("aim_screenshot_url", sa.String(500), nullable=True),
        sa.Column("aim_anchor_x", sa.Float(), nullable=True),
        sa.Column("aim_anchor_y", sa.Float(), nullable=True),
        sa.Column("setup_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "source_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("source.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("attribution_url", sa.String(500), nullable=True),
        sa.Column("attribution_author", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending_review"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('pending_review','accepted','hidden')",
            name="ck_lineup_status",
        ),
        sa.CheckConstraint(
            "side IN ('side_a','side_b','any')",
            name="ck_lineup_side",
        ),
    )
    op.create_index("ix_lineup_game_id", "lineup", ["game_id"])
    op.create_index("ix_lineup_map_id", "lineup", ["map_id"])
    op.create_index("ix_lineup_target_zone_id", "lineup", ["target_zone_id"])
    op.create_index("ix_lineup_status", "lineup", ["status"])

    # ----------------------------------------------------------- lineup_package
    op.create_table(
        "lineup_package",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "game_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "map_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("side", sa.String(10), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "side IN ('side_a','side_b','any')",
            name="ck_lineup_package_side",
        ),
    )
    op.create_index("ix_lineup_package_game_id", "lineup_package", ["game_id"])
    op.create_index("ix_lineup_package_map_id", "lineup_package", ["map_id"])

    # -------------------------------------------------- lineup_package_lineup
    op.create_table(
        "lineup_package_lineup",
        sa.Column(
            "package_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lineup_package.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "lineup_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lineup.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("package_id", "lineup_id", name="pk_lineup_package_lineup"),
    )


def downgrade() -> None:
    op.drop_table("lineup_package_lineup")
    op.drop_table("lineup_package")
    op.drop_table("lineup")
    op.drop_table("source")
    op.drop_table("utility_type")
    op.drop_table("site")
    op.drop_table("map_zone")
    op.drop_table("map")
    op.drop_table("game")
    op.drop_table("auth_event")
    op.drop_table("audit_log")
    op.drop_table("user")
