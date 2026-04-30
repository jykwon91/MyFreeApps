"""public inquiry form (T0) — listings.slug + inquiries form fields + spam assessments

Adds:
- ``listings.slug`` (TEXT NULL UNIQUE) with backfill for existing rows
- ``inquiries`` form columns + spam triage columns + audit columns
- ``inquiry_spam_assessments`` table (append-only audit per check)

Source enum widening: adds ``public_form`` to the inquiries source allowlist.
The CHECK constraint is rewritten in-place so existing rows aren't touched.

Revision ID: b2c3d4e5f6a1
Revises: i1k3l6n8p0q2
Create Date: 2026-04-29 00:00:00.000000
"""
from __future__ import annotations

import re
import secrets
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, None] = 'j1k3l5m7n9p1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Local copies — Alembic migrations should never import live app code so they
# stay runnable against any future codebase state.
_INQUIRY_SOURCES = ('FF', 'TNH', 'direct', 'other', 'public_form')
_INQUIRY_SUBMITTED_VIA = ('manual_entry', 'gmail_oauth', 'public_form')
_INQUIRY_SPAM_STATUSES = (
    'unscored', 'clean', 'flagged', 'spam', 'manually_cleared',
)
_INQUIRY_EMPLOYMENT_STATUSES = (
    'employed', 'student', 'self_employed', 'between_jobs', 'retired', 'other',
)
_INQUIRY_SPAM_ASSESSMENT_TYPES = (
    'turnstile', 'honeypot', 'submit_timing', 'disposable_email',
    'rate_limit', 'claude_score', 'manual_override',
)


def _sql_in_list(values: tuple[str, ...]) -> str:
    return '(' + ', '.join(f"'{v}'" for v in values) + ')'


_SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
_NON_ALPHANUM_RE = re.compile(r'[^a-z0-9]+')
_LEADING_TRAILING_DASH_RE = re.compile(r'^-+|-+$')


def _slugify_title(title: str) -> str:
    decomposed = unicodedata.normalize('NFKD', title or '')
    ascii_only = decomposed.encode('ascii', 'ignore').decode('ascii')
    lowered = ascii_only.lower()
    hyphenated = _NON_ALPHANUM_RE.sub('-', lowered)
    trimmed = _LEADING_TRAILING_DASH_RE.sub('', hyphenated)
    if not trimmed:
        trimmed = 'listing'
    if len(trimmed) > 200:
        trimmed = trimmed[:200].rstrip('-')
    return trimmed


def _random_suffix() -> str:
    return ''.join(secrets.choice(_SUFFIX_ALPHABET) for _ in range(6))


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == 'postgresql'

    # --- 1. listings.slug ---
    op.add_column(
        'listings',
        sa.Column('slug', sa.String(length=220), nullable=True),
    )

    # Backfill — for existing listings, generate a slug from the title.
    # Retry-on-collision is unnecessary because the suffix keyspace is huge
    # and we're seeding into an empty slug column on a small portfolio.
    rows = bind.execute(sa.text('SELECT id, title FROM listings')).fetchall()
    seen: set[str] = set()
    for row in rows:
        listing_id = row[0]
        title = row[1] or 'listing'
        for _attempt in range(5):
            slug = f'{_slugify_title(title)}-{_random_suffix()}'
            if slug not in seen:
                seen.add(slug)
                break
        bind.execute(
            sa.text('UPDATE listings SET slug = :slug WHERE id = :id'),
            {'slug': slug, 'id': listing_id},
        )

    op.create_unique_constraint('uq_listings_slug', 'listings', ['slug'])

    # --- 2. Widen inquiries.source CHECK to allow 'public_form' ---
    if is_postgres:
        op.drop_constraint('chk_inquiry_source', 'inquiries', type_='check')
        op.create_check_constraint(
            'chk_inquiry_source',
            'inquiries',
            f'source IN {_sql_in_list(_INQUIRY_SOURCES)}',
        )

    # --- 3. inquiries form + spam columns ---
    op.add_column(
        'inquiries',
        sa.Column(
            'submitted_via',
            sa.String(length=20),
            nullable=False,
            server_default='manual_entry',
        ),
    )
    op.add_column(
        'inquiries',
        sa.Column(
            'spam_status',
            sa.String(length=20),
            nullable=False,
            server_default='unscored',
        ),
    )
    op.add_column(
        'inquiries',
        sa.Column('spam_score', sa.Numeric(precision=5, scale=2), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('move_in_date', sa.Date(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('lease_length_months', sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('occupant_count', sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('has_pets', sa.Boolean(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('pets_description', sa.Text(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('vehicle_count', sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('current_city', sa.String(length=200), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('employment_status', sa.String(length=20), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('why_this_room', sa.Text(), nullable=True),
    )
    op.add_column(
        'inquiries', sa.Column('additional_notes', sa.Text(), nullable=True),
    )
    if is_postgres:
        op.add_column(
            'inquiries', sa.Column('client_ip', postgresql.INET(), nullable=True),
        )
    else:
        op.add_column(
            'inquiries', sa.Column('client_ip', sa.String(length=45), nullable=True),
        )
    op.add_column(
        'inquiries', sa.Column('user_agent', sa.String(length=500), nullable=True),
    )

    # CHECK constraints + new index
    op.create_check_constraint(
        'chk_inquiry_submitted_via',
        'inquiries',
        f'submitted_via IN {_sql_in_list(_INQUIRY_SUBMITTED_VIA)}',
    )
    op.create_check_constraint(
        'chk_inquiry_spam_status',
        'inquiries',
        f'spam_status IN {_sql_in_list(_INQUIRY_SPAM_STATUSES)}',
    )
    op.create_check_constraint(
        'chk_inquiry_employment_status',
        'inquiries',
        (
            'employment_status IS NULL OR employment_status IN '
            f'{_sql_in_list(_INQUIRY_EMPLOYMENT_STATUSES)}'
        ),
    )
    op.create_check_constraint(
        'chk_inquiry_spam_score_range',
        'inquiries',
        'spam_score IS NULL OR (spam_score >= 0 AND spam_score <= 100)',
    )
    op.create_check_constraint(
        'chk_inquiry_lease_length_months',
        'inquiries',
        'lease_length_months IS NULL OR (lease_length_months BETWEEN 1 AND 24)',
    )
    op.create_check_constraint(
        'chk_inquiry_occupant_count',
        'inquiries',
        'occupant_count IS NULL OR (occupant_count BETWEEN 1 AND 10)',
    )
    op.create_check_constraint(
        'chk_inquiry_vehicle_count',
        'inquiries',
        'vehicle_count IS NULL OR (vehicle_count BETWEEN 0 AND 10)',
    )
    if is_postgres:
        op.execute(
            'CREATE INDEX ix_inquiries_org_spam_active ON inquiries '
            '(organization_id, spam_status) WHERE deleted_at IS NULL'
        )

    # --- 4. inquiry_spam_assessments ---
    if is_postgres:
        flags_col = postgresql.ARRAY(sa.String())
        details_col = postgresql.JSONB(astext_type=sa.Text())
    else:
        flags_col = sa.JSON()
        details_col = sa.JSON()

    op.create_table(
        'inquiry_spam_assessments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('inquiry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('assessment_type', sa.String(length=40), nullable=False),
        sa.Column('passed', sa.Boolean(), nullable=True),
        sa.Column('score', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('flags', flags_col, nullable=True),
        sa.Column('details_json', details_col, nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(['inquiry_id'], ['inquiries.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            f'assessment_type IN {_sql_in_list(_INQUIRY_SPAM_ASSESSMENT_TYPES)}',
            name='chk_inquiry_spam_assessment_type',
        ),
        sa.CheckConstraint(
            'score IS NULL OR (score >= 0 AND score <= 100)',
            name='chk_inquiry_spam_assessment_score_range',
        ),
    )
    op.create_index(
        'ix_inquiry_spam_assessments_inquiry_id',
        'inquiry_spam_assessments', ['inquiry_id'],
    )
    op.create_index(
        'ix_inquiry_spam_assessments_inquiry_created',
        'inquiry_spam_assessments', ['inquiry_id', 'created_at'],
    )


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == 'postgresql'

    op.drop_index(
        'ix_inquiry_spam_assessments_inquiry_created',
        table_name='inquiry_spam_assessments',
    )
    op.drop_index(
        'ix_inquiry_spam_assessments_inquiry_id',
        table_name='inquiry_spam_assessments',
    )
    op.drop_table('inquiry_spam_assessments')

    if is_postgres:
        op.execute('DROP INDEX IF EXISTS ix_inquiries_org_spam_active')

    for name in (
        'chk_inquiry_vehicle_count',
        'chk_inquiry_occupant_count',
        'chk_inquiry_lease_length_months',
        'chk_inquiry_spam_score_range',
        'chk_inquiry_employment_status',
        'chk_inquiry_spam_status',
        'chk_inquiry_submitted_via',
    ):
        op.drop_constraint(name, 'inquiries', type_='check')

    for col in (
        'user_agent', 'client_ip', 'additional_notes', 'why_this_room',
        'employment_status', 'current_city', 'vehicle_count',
        'pets_description', 'has_pets', 'occupant_count',
        'lease_length_months', 'move_in_date', 'spam_score', 'spam_status',
        'submitted_via',
    ):
        op.drop_column('inquiries', col)

    if is_postgres:
        op.drop_constraint('chk_inquiry_source', 'inquiries', type_='check')
        op.create_check_constraint(
            'chk_inquiry_source',
            'inquiries',
            "source IN ('FF', 'TNH', 'direct', 'other')",
        )

    op.drop_constraint('uq_listings_slug', 'listings', type_='unique')
    op.drop_column('listings', 'slug')
