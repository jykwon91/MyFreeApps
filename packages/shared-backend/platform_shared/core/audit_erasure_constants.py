"""Constants for erasing a deleted account's content from ``audit_logs``."""

# Written over every ``old_value`` / ``new_value`` the erasure reaches, unless it
# is NULL or already MASKED_AUDIT_VALUE. MBK's trg_audit_log_immutable allows an
# UPDATE that writes this exact string (migration auditredact261122).
ERASED_AUDIT_VALUE = "[erased]"

# The listener's mask for a sensitive field (``platform_shared.core.audit``).
# Left as it is, so a reader can still tell a value that was never captured
# from one that was captured and later erased.
MASKED_AUDIT_VALUE = "***"

# The column that marks a row as belonging to a shared workspace (MBK orgs).
# Tables carrying it, the tables it points at, and every table that points at
# one of those hold a workspace's records, which its remaining members keep.
ORGANIZATION_TENANT_COLUMN = "organization_id"

# Most values bound into one ``IN (...)`` list, well under SQLite's and
# asyncpg's bind-parameter limits.
IN_CLAUSE_CHUNK_SIZE = 500
