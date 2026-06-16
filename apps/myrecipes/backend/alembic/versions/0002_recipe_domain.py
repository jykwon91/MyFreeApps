"""Recipe domain — recipe + version history + cook logs

Creates the MyRecipes Tier-3 domain tables. Every table is tenant-scoped:
``recipe``, ``recipe_version``, and ``cook_log`` carry a ``user_id`` FK with
``ON DELETE CASCADE`` so deleting a user removes all their recipe data;
``recipe_ingredient`` / ``recipe_step`` cascade via their version.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-15 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------------- recipe
    op.create_table(
        "recipe",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source", sa.String(1000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_recipe_user_id", "recipe", ["user_id"])

    # -------------------------------------------------------- recipe_version
    op.create_table(
        "recipe_version",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "recipe_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipe.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        # Lineage pointer to the version this was tweaked from. Plain UUID, not a
        # DB FK — append-only history maintained by the service (see model).
        sa.Column("parent_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("servings", sa.String(50), nullable=True),
        sa.Column("prep_minutes", sa.Integer(), nullable=True),
        sa.Column("cook_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("recipe_id", "version_number", name="uq_recipe_version_number"),
    )
    op.create_index("ix_recipe_version_recipe_id", "recipe_version", ["recipe_id"])
    op.create_index("ix_recipe_version_user_id", "recipe_version", ["user_id"])

    # ----------------------------------------------------- recipe_ingredient
    op.create_table(
        "recipe_ingredient",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "version_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipe_version.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("lineage_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=True),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("note", sa.String(255), nullable=True),
    )
    op.create_index("ix_recipe_ingredient_version_id", "recipe_ingredient", ["version_id"])

    # ----------------------------------------------------------- recipe_step
    op.create_table(
        "recipe_step",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "version_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipe_version.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
    )
    op.create_index("ix_recipe_step_version_id", "recipe_step", ["version_id"])

    # -------------------------------------------------------------- cook_log
    op.create_table(
        "cook_log",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "version_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipe_version.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "cooked_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("rating", sa.SmallInteger(), nullable=True),
        sa.Column("outcome_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "rating IS NULL OR (rating BETWEEN 1 AND 5)", name="ck_cook_log_rating",
        ),
    )
    op.create_index("ix_cook_log_version_id", "cook_log", ["version_id"])
    op.create_index("ix_cook_log_user_id", "cook_log", ["user_id"])


def downgrade() -> None:
    op.drop_table("cook_log")
    op.drop_table("recipe_step")
    op.drop_table("recipe_ingredient")
    op.drop_table("recipe_version")
    op.drop_table("recipe")
