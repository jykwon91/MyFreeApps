"""Auth event type constants used by every app's auth-event audit log."""


class AuthEventType:
    LOGIN_SUCCESS = "login.success"
    LOGIN_FAILURE = "login.failure"
    LOGIN_BLOCKED_LOCKED = "login.blocked.locked"
    LOGIN_BLOCKED_UNVERIFIED = "login.blocked.unverified"
    LOGIN_BLOCKED_RATE_LIMIT = "login.blocked.rate_limit"
    REGISTER_SUCCESS = "register.success"
    EMAIL_VERIFY_SUCCESS = "email_verify.success"
    EMAIL_VERIFY_RESEND = "email_verify.resend"
    PASSWORD_RESET_REQUEST = "password_reset.request"
    PASSWORD_RESET_SUCCESS = "password_reset.success"
    PASSWORD_CHANGE_SUCCESS = "password_change.success"
    TOTP_ENABLED = "totp.enabled"
    TOTP_DISABLED = "totp.disabled"
    TOTP_VERIFY_SUCCESS = "totp.verify.success"
    TOTP_VERIFY_FAILURE = "totp.verify.failure"
    TOTP_RECOVERY_USED = "totp.recovery.used"
    OAUTH_CONNECT = "oauth.connect"
    OAUTH_DISCONNECT = "oauth.disconnect"
    ACCOUNT_DELETED = "account.deleted"
    DATA_EXPORTED = "data.exported"
    # Strict superuser-gate evaluations. Every gate hit emits one of these,
    # whether it passed or which failure mode tripped. See
    # platform_shared.core.permissions.make_strict_superuser_gate for the
    # defense-in-depth rationale.
    SUPERUSER_GATE_PASSED = "superuser.gate.passed"
    SUPERUSER_GATE_DENIED_NOT_SUPERUSER = "superuser.gate.denied.not_superuser"
    SUPERUSER_GATE_DENIED_TOKEN_NO_IAT = "superuser.gate.denied.token_no_iat"
    SUPERUSER_GATE_DENIED_TOKEN_STALE = "superuser.gate.denied.token_stale"
    SUPERUSER_GATE_DENIED_MISSING_TOTP = "superuser.gate.denied.missing_totp"
    SUPERUSER_GATE_DENIED_BAD_TOTP = "superuser.gate.denied.bad_totp"
    # Boot-time platform-admin seeding (multi-user apps). A privilege change
    # that bypasses the admin API must leave the same forensic trail — see
    # platform_shared.services.seed_admin_service. "refused" fires when a row
    # with SEED_ADMIN_EMAIL exists but isn't seed-owned (hash mismatch).
    SEED_ADMIN_CREATED = "seed_admin.created"
    SEED_ADMIN_PROMOTED = "seed_admin.promoted"
    SEED_ADMIN_REFUSED = "seed_admin.refused"
