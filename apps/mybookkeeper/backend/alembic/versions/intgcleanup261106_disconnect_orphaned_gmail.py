"""disconnect connections made by people who can no longer connect one

A connection is the mailbox of the member who made it (``integrations.user_id``).
Since #1657 and #1660, removing that member or making them a viewer deletes it.
Connections left from before then still sync into the org and send from it:
ones whose maker is no longer a member, or is now a viewer. This deletes them
and writes an ``oauth.disconnect`` auth event for each, as the app does.

The downgrade can't bring them back (the tokens are gone): the org reconnects.

Revision ID: intgcleanup261106
Revises: intgorgkey261106
Create Date: 2026-11-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "intgcleanup261106"
down_revision: Union[str, None] = "intgorgkey261106"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DISCONNECT_ORPHANED = sa.text(
    """
    WITH gone AS (
        DELETE FROM integrations i
        WHERE NOT EXISTS (
            SELECT 1 FROM organization_members m
            WHERE m.organization_id = i.organization_id
              AND m.user_id = i.user_id
              AND m.org_role <> 'viewer'
        )
        RETURNING i.user_id, i.organization_id, i.provider,
            EXISTS (
                SELECT 1 FROM organization_members m
                WHERE m.organization_id = i.organization_id AND m.user_id = i.user_id
            ) AS still_a_member
    ), logged AS (
        INSERT INTO auth_events (id, user_id, event_type, metadata, succeeded, created_at)
        SELECT gen_random_uuid(), user_id, 'oauth.disconnect',
            jsonb_build_object(
                'provider', provider,
                'reason', CASE WHEN still_a_member THEN 'made_viewer' ELSE 'member_removed' END,
                'by', NULL,
                'source', 'migration intgcleanup261106',
                'organization_id', organization_id
            ),
            true, now()
        FROM gone
        RETURNING 1
    )
    SELECT count(*) FROM logged
    """
)


def upgrade() -> None:
    disconnected = op.get_bind().execute(_DISCONNECT_ORPHANED).scalar_one()
    print(f"intgcleanup261106: disconnected {disconnected} connection(s) made by non-members or viewers")


def downgrade() -> None:
    pass  # Irreversible by design — see module docstring.
