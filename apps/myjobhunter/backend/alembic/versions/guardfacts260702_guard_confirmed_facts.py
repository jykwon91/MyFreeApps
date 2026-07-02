"""Guard confirmation state on resume refinement sessions.

Fixes the hallucination-guard clarify dead-end: the guard re-checked
every regenerated proposal against the UNCHANGED source resume, so a
user answering "yes, that's correct" could never unblock the loop —
the same phrase re-flagged and the identical canned question returned,
burning a Claude call per retry.

Four columns on ``resume_refinement_sessions``:

1. ``confirmed_facts`` — session-level allowlist of facts the user has
   explicitly confirmed (clarify answers / "Use it anyway"). Passed
   into every guard check so a confirmed fact is never re-flagged.
2. ``guard_flag_counts`` — per-target flag counts (keyed by stringified
   target_index). Drives the loop breaker: from the second flag on the
   same target the frontend offers an explicit "Use it anyway" action
   instead of re-asking.
3. ``pending_guard_flagged`` — the phrases the guard flagged on the
   current pending clarify (NULL when the pending state isn't
   guard-generated).
4. ``pending_flagged_proposal`` — the guard-held proposal text, kept so
   "Use it anyway" can apply exactly what the user confirmed.

Also widens the turn-role check constraint with ``user_accept_flagged``
(the "Use it anyway" turn).

Server defaults only, no backfill: existing sessions have no confirmed
facts and no recorded flags, which the empty list / object encodes
correctly.

Revision ID: guardfacts260702
Revises: discexp260528
Create Date: 2026-07-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "guardfacts260702"
down_revision: Union[str, None] = "discexp260528"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_ROLES_OLD = (
    "'ai_critique',"
    "'ai_proposal',"
    "'user_accept',"
    "'user_custom',"
    "'user_request_alternative',"
    "'user_skip',"
    "'session_complete'"
)
_ROLES_NEW = (
    "'ai_critique',"
    "'ai_proposal',"
    "'user_accept',"
    "'user_accept_flagged',"
    "'user_custom',"
    "'user_request_alternative',"
    "'user_skip',"
    "'session_complete'"
)


def upgrade() -> None:
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "confirmed_facts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "guard_flag_counts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "pending_guard_flagged",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "resume_refinement_sessions",
        sa.Column("pending_flagged_proposal", sa.Text(), nullable=True),
    )

    op.drop_constraint(
        "chk_refinement_turn_role", "resume_refinement_turns", type_="check",
    )
    op.create_check_constraint(
        "chk_refinement_turn_role",
        "resume_refinement_turns",
        f"role IN ({_ROLES_NEW})",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_refinement_turn_role", "resume_refinement_turns", type_="check",
    )
    op.create_check_constraint(
        "chk_refinement_turn_role",
        "resume_refinement_turns",
        f"role IN ({_ROLES_OLD})",
    )
    op.drop_column("resume_refinement_sessions", "pending_flagged_proposal")
    op.drop_column("resume_refinement_sessions", "pending_guard_flagged")
    op.drop_column("resume_refinement_sessions", "guard_flag_counts")
    op.drop_column("resume_refinement_sessions", "confirmed_facts")
