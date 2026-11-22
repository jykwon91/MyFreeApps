"""The masking configuration the audit listener cannot be attached without."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, kw_only=True)
class AuditConfig:
    """What one app's audit listener masks and skips.

    Every field is required, so a listener can only be attached with an app's
    full masking configuration in hand (see
    :func:`platform_shared.core.audit.register_audit_listeners`).

    Attributes:
        sensitive_fields: Column attribute names whose values are written to
            ``audit_logs`` as the mask instead of the value (secrets, PII, and
            every ``EncryptedString`` column, whose attribute holds the
            decrypted value).
        skip_tables: Table names the listener never audits (high-volume or
            secret-bearing tables). The audit table itself is always skipped.
        skip_fields: Column attribute names left out of audit rows entirely
            (large blobs where neither the value nor a mask is useful).
    """

    sensitive_fields: frozenset[str]
    skip_tables: frozenset[str]
    skip_fields: frozenset[str]
