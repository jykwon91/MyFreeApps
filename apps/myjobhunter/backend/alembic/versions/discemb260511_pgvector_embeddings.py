"""Add pgvector embeddings to discovered_jobs + profiles.

Foundation for the two-stage scoring pipeline (PR 4a — this migration —
plus PR 4b which wires the consumer). Stores local fastembed
``all-MiniLM-L6-v2`` vectors so cheap cosine-similarity ranking can
narrow the candidate set BEFORE we spend Anthropic tokens scoring
the top-N.

This migration is intentionally write-side only. No code reads from
``embedding`` yet — PR 4b changes ``discovery_score_service.py`` to
consume the column. Until then the column is NULL on existing rows
and gets populated by ``discovery_embedding_service.embed_pending_for_user``
on fetch.

Schema additions:

- ``CREATE EXTENSION IF NOT EXISTS vector`` — pgvector enables the
  ``vector(N)`` column type and the ``vector_cosine_ops`` index
  operator class. The Postgres user MUST be a superuser OR the
  extension MUST already be installed on the cluster. In docker-compose
  the postgres image is pinned to ``pgvector/pgvector:pg16`` in the
  same PR; on the VPS the operator must either upgrade the postgres
  image or run ``CREATE EXTENSION vector`` as a superuser before
  applying this migration. See the PR description's "Operational
  migration required" section for the exact steps.

- ``discovered_jobs.embedding vector(384)`` — the posting embedding.
  Computed from ``title + ' ' + company_name + ' ' + description[:2000]``
  by ``discovery_embedding_service.embed_posting``. 384 dims matches
  the all-MiniLM-L6-v2 output size.

- ``discovered_jobs.embedding_model VARCHAR(50)`` — records which model
  produced ``embedding`` so a future model swap (e.g. switching to
  a 768-dim model, or to bge-small) can detect stale rows and re-embed
  them without losing data. NULL means the row has not been embedded.

- ``discovered_jobs.embedded_at TIMESTAMPTZ`` — when the embedding was
  last computed. Together with ``embedding_model`` lets a re-embed
  job target the right rows.

- ``profiles.embedding vector(384)`` plus matching ``embedding_model``
  and ``embedded_at``. Same shape; populated when profile fields that
  affect job matching change (skills, work_history, resume).

Index:

- ``ix_discovered_jobs_embedding`` — ivfflat over ``vector_cosine_ops``
  with ``lists = 100``. ivfflat is the recommended approximate index
  for cosine similarity at the scale we expect (single-user, 1k-100k
  postings). ``lists = 100`` is a reasonable default per pgvector docs
  for tables up to ~1M rows; we will tune if the empirical row count
  diverges. The index is created empty — pgvector populates it on
  demand and on ``REINDEX``. With zero rows the index works correctly,
  it just falls back to a full scan until enough data exists. No
  separate index on profiles.embedding because we only ever query
  one profile row at a time by user_id (no similarity search on profiles).

Downgrade: drops the index, the new columns, and the extension
(``DROP EXTENSION vector``). Reversible. Note that the extension drop
is a no-op if other objects in the database still depend on it; for
this app that should not be the case but the migration uses
``IF EXISTS`` defensively.

Revision ID: discemb260511
Revises: discsrc260511
Create Date: 2026-05-11
"""
from typing import Sequence, Union

from alembic import op


revision: str = "discemb260511"
down_revision: Union[str, None] = "discsrc260511"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 384 dims matches sentence-transformers/all-MiniLM-L6-v2 — the model
# wired in ``discovery_embedding_service``. Changing this requires a
# re-embed of every row, hence the explicit ``embedding_model`` column
# that records which model produced each vector.
_EMBED_DIMS = 384

# ivfflat lists parameter — see pgvector docs. 100 is a good default
# for tables up to ~1M rows; rebuild the index with a larger value if
# the table grows past that.
_IVFFLAT_LISTS = 100


def upgrade() -> None:
    # 1. Enable pgvector. Idempotent — IF NOT EXISTS makes the migration
    #    safe to apply on a fresh DB (where pgvector might already be
    #    installed via the pgvector/pgvector base image) and on the
    #    existing VPS (where the operator installed it manually per the
    #    PR's operational migration block).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2. discovered_jobs additions.
    op.execute(
        f"ALTER TABLE discovered_jobs "
        f"ADD COLUMN embedding vector({_EMBED_DIMS})"
    )
    op.execute(
        "ALTER TABLE discovered_jobs ADD COLUMN embedding_model VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE discovered_jobs "
        "ADD COLUMN embedded_at TIMESTAMP WITH TIME ZONE"
    )

    # 3. ivfflat index for cosine similarity. PR 4b queries this index
    #    via ``embedding <=> profile.embedding`` (cosine distance) to
    #    rank candidates cheaply before sending the top-N to Anthropic.
    #    Created with WITH (lists = 100) per pgvector docs.
    op.execute(
        f"CREATE INDEX ix_discovered_jobs_embedding "
        f"ON discovered_jobs "
        f"USING ivfflat (embedding vector_cosine_ops) "
        f"WITH (lists = {_IVFFLAT_LISTS})"
    )

    # 4. profiles additions — same shape so the score loop can compare
    #    user_profile.embedding <=> posting.embedding directly.
    op.execute(
        f"ALTER TABLE profiles ADD COLUMN embedding vector({_EMBED_DIMS})"
    )
    op.execute(
        "ALTER TABLE profiles ADD COLUMN embedding_model VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE profiles ADD COLUMN embedded_at TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    # Reverse order: drop the index, then the columns, then the
    # extension. ``DROP EXTENSION vector`` will fail if any other object
    # still references the vector type — IF EXISTS guards against the
    # extension already being absent (re-run safety).
    op.execute("DROP INDEX IF EXISTS ix_discovered_jobs_embedding")

    op.execute("ALTER TABLE profiles DROP COLUMN IF EXISTS embedded_at")
    op.execute("ALTER TABLE profiles DROP COLUMN IF EXISTS embedding_model")
    op.execute("ALTER TABLE profiles DROP COLUMN IF EXISTS embedding")

    op.execute(
        "ALTER TABLE discovered_jobs DROP COLUMN IF EXISTS embedded_at"
    )
    op.execute(
        "ALTER TABLE discovered_jobs DROP COLUMN IF EXISTS embedding_model"
    )
    op.execute(
        "ALTER TABLE discovered_jobs DROP COLUMN IF EXISTS embedding"
    )

    # Extension last — RESTRICT (default) is safe; if anything still
    # references the vector type, the drop fails loudly rather than
    # cascading.
    op.execute("DROP EXTENSION IF EXISTS vector")
