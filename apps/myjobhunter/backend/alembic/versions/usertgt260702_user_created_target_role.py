"""Widen the refinement turn role constraint with ``user_created_target``.

User-directed targeting lets the user click a draft line to create an
improvement target; the action is recorded as a turn so the transcript
explains why the cursor jumped. Data-only widening — no new columns.

Revision ID: usertgt260702
Revises: iscur260702
Create Date: 2026-07-02
"""
from typing import Sequence, Union

from alembic import op


revision: str = "usertgt260702"
down_revision: Union[str, None] = "iscur260702"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_ROLES = (
    "'ai_critique','ai_proposal','user_accept','user_accept_flagged',"
    "'user_custom','user_request_alternative','user_skip','session_complete'"
)
_NEW_ROLES = (
    "'ai_critique','ai_proposal','user_accept','user_accept_flagged',"
    "'user_custom','user_request_alternative','user_created_target',"
    "'user_skip','session_complete'"
)


def upgrade() -> None:
    op.drop_constraint(
        "chk_refinement_turn_role",
        "resume_refinement_turns",
        type_="check",
    )
    op.create_check_constraint(
        "chk_refinement_turn_role",
        "resume_refinement_turns",
        f"role IN ({_NEW_ROLES})",
    )


def downgrade() -> None:
    # Rows in the new role would violate the narrowed constraint —
    # resolve to the nearest old-world equivalent (a user-directed
    # generation request) before narrowing.
    op.execute(
        "UPDATE resume_refinement_turns "
        "SET role = 'user_request_alternative' WHERE role = 'user_created_target'"
    )
    op.drop_constraint(
        "chk_refinement_turn_role",
        "resume_refinement_turns",
        type_="check",
    )
    op.create_check_constraint(
        "chk_refinement_turn_role",
        "resume_refinement_turns",
        f"role IN ({_OLD_ROLES})",
    )
