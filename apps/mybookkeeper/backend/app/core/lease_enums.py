"""Canonical string values for the Lease Templates domain (Phase 1).

Per project convention (RENTALS_PLAN.md §4.1 / applicant_enums.py): status /
category columns use ``String(N)`` plus a ``CheckConstraint``, never
``SQLAlchemy Enum``. These tuples are the single source of truth — referenced
from both the SQLAlchemy model ``CheckConstraint``s and the Alembic migration
DDL.

Note: the new ``signed_leases`` table is intentionally separate from the
pre-existing ``leases`` table (financial record under
``app/models/properties/lease.py``). See PR description for the naming
rationale.
"""

# Lease lifecycle states. ``draft`` = values being filled in;
# ``generated`` = template substitutions rendered to MinIO; ``sent`` = lease
# delivered to the tenant for signature; ``signed`` = signed PDF uploaded;
# ``active`` = lease in effect; ``ended`` = past contract_end; ``terminated``
# = ended early.
SIGNED_LEASE_STATUSES: tuple[str, ...] = (
    "draft",
    "generated",
    "sent",
    "signed",
    "active",
    "ended",
    "terminated",
)

# Allowed input types for placeholder spec.
LEASE_PLACEHOLDER_INPUT_TYPES: tuple[str, ...] = (
    "text",
    "email",
    "phone",
    "date",
    "number",
    "computed",
    "signature",
)

# Categorises a signed lease attachment for grouping in the UI.
LEASE_ATTACHMENT_KINDS: tuple[str, ...] = (
    "rendered_original",
    "signed_lease",
    "signed_addendum",
    "move_in_inspection",
    "move_out_inspection",
    "insurance_proof",
    "amendment",
    "notice",
    "other",
)

# How the signed_lease record was created.
# 'generated' = created from a lease template (Phase 1 flow).
# 'imported'  = uploaded externally-signed PDFs with no template involved.
LEASE_KINDS: tuple[str, ...] = ("generated", "imported")


# How the signed_lease record was created.
# 'generated' = created from a lease template (Phase 1 flow).
# 'imported'  = uploaded externally-signed PDFs with no template involved.
LEASE_KINDS: tuple[str, ...] = ("generated", "imported")


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


SIGNED_LEASE_STATUSES_SQL = _sql_in_list(SIGNED_LEASE_STATUSES)
LEASE_PLACEHOLDER_INPUT_TYPES_SQL = _sql_in_list(LEASE_PLACEHOLDER_INPUT_TYPES)
LEASE_ATTACHMENT_KINDS_SQL = _sql_in_list(LEASE_ATTACHMENT_KINDS)
LEASE_KINDS_SQL = _sql_in_list(LEASE_KINDS)
