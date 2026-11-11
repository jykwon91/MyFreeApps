"""Normalise existing companies.primary_domain values to bare hostnames

Revision ID: compdom261111
Revises: apschedjobs261110
Create Date: 2026-11-11 00:00:00.000000

Until now nothing normalised ``primary_domain`` on write, so the API stored
whatever lowercase text it was sent: ``https://acme.com/careers``,
``www.acme.com`` and ``acme.com`` were three different values, which defeated
``uq_company_user_domain`` and fed company research a URL instead of a domain.
Writers now go through ``app.core.company_domain.normalize_company_domain``;
this rewrites the rows stored before that, using a frozen copy of that
helper's rules as of this revision (see ``_normalize_domain``).

- A value that normalises to a different host is rewritten.
- A blank value becomes NULL (blank already meant "no domain").
- When several of one user's rows normalise to the same host, the oldest row
  (``created_at``, then ``id``) keeps it and the others are set to NULL. The
  company rows themselves are untouched; each nulled row is logged with its
  id and original value.
- A value that is not a domain at all is left as it is and logged, so no user
  input is destroyed. The API rejects such values from now on.

The table is locked in SHARE ROW EXCLUSIVE mode for the migration's
transaction: reads continue, but an app instance still running the old code
cannot insert or update a company (and so create a new collision) between the
SELECT and the UPDATEs. Writers wait for the commit; they don't fail.

Downgrade is a no-op: the original spellings are not kept.
"""
from __future__ import annotations

import logging
import re
import uuid
from collections import defaultdict
from typing import Sequence, Union
from urllib.parse import urlsplit

import idna
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "compdom261111"
down_revision: Union[str, None] = "apschedjobs261110"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

_SET_DOMAIN = sa.text("UPDATE companies SET primary_domain = :domain WHERE id = :id")

_MAX_HOSTNAME_LEN = 253
_WWW_PREFIX = "www."
_LABEL_RE = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
_NUMERIC_RE = re.compile(r"^[0-9]+$")


def upgrade() -> None:
    normalize_existing_domains(op.get_bind())


def downgrade() -> None:
    pass


def normalize_existing_domains(bind: Connection) -> None:
    """Rewrite every stored ``primary_domain`` to its normalised form."""
    bind.execute(sa.text("LOCK TABLE companies IN SHARE ROW EXCLUSIVE MODE"))
    rows = bind.execute(
        sa.text(
            "SELECT id, user_id, primary_domain FROM companies "
            "WHERE primary_domain IS NOT NULL ORDER BY created_at, id"
        )
    ).all()

    groups: dict[tuple[uuid.UUID, str], list[tuple[uuid.UUID, str]]] = defaultdict(list)
    to_null: list[uuid.UUID] = []
    for company_id, user_id, stored in rows:
        try:
            normalized = _normalize_domain(stored)
        except ValueError:
            logger.warning(
                "companies.primary_domain left unchanged (not a domain): id=%s value=%r",
                company_id, stored,
            )
            continue
        if normalized is None:
            to_null.append(company_id)
        else:
            groups[(user_id, normalized)].append((company_id, stored))

    to_set: list[tuple[uuid.UUID, str]] = []
    for (user_id, normalized), members in groups.items():
        (keeper_id, keeper_value), *others = members
        if keeper_value != normalized:
            to_set.append((keeper_id, normalized))
        for company_id, stored in others:
            to_null.append(company_id)
            logger.warning(
                "companies.primary_domain collision: id=%s value=%r normalises to %r, "
                "already held by older company id=%s (user_id=%s); domain cleared",
                company_id, stored, normalized, keeper_id, user_id,
            )

    # Clear first so no rewritten keeper collides with a row still holding its
    # value. Each list goes as one executemany batch, not a round trip per row.
    if to_null:
        bind.execute(_SET_DOMAIN, [{"domain": None, "id": company_id} for company_id in to_null])
    if to_set:
        bind.execute(
            _SET_DOMAIN,
            [{"domain": normalized, "id": company_id} for company_id, normalized in to_set],
        )
    logger.info(
        "companies.primary_domain normalised: %d rewritten, %d cleared",
        len(to_set), len(to_null),
    )


def _normalize_domain(value: str) -> str | None:
    """Frozen on purpose: ``app.core.company_domain.normalize_company_domain`` at compdom261111.

    Do not replace with an import or "fix" to match the live helper. A
    migration must do the same thing every time it runs; if the helper's
    rules change later, write a new migration for the stored rows.
    Returns ``None`` for a blank value and raises ``ValueError`` for a value
    that is not a multi-label hostname.
    """
    text = value.strip()
    if not text:
        return None
    try:
        host = urlsplit(text if "://" in text else f"//{text}").hostname
    except ValueError as exc:
        raise ValueError(value) from exc
    if not host:
        raise ValueError(value)

    # Encode first: UTS 46 lowercases and maps full-width letters and
    # ideographic dots ("ｗｗｗ.", "。") to ASCII, so the trailing-dot and
    # "www." steps below see the final form and the result is idempotent.
    try:
        host = idna.encode(host, uts46=True).decode("ascii")
    except idna.IDNAError as exc:
        raise ValueError(value) from exc

    host = host.removesuffix(".")
    # Repeat so "www.www.acme.com" settles in one call; keep "www.com".
    while host.startswith(_WWW_PREFIX) and "." in host[len(_WWW_PREFIX):]:
        host = host[len(_WWW_PREFIX):]

    labels = host.split(".")
    if (
        len(host) > _MAX_HOSTNAME_LEN
        or len(labels) < 2
        or not all(_LABEL_RE.match(label) for label in labels)
        or _NUMERIC_RE.match(labels[-1])
    ):
        raise ValueError(value)
    return host
