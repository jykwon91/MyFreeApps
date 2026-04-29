"""Unit tests for platform_shared.core.auth_events.AuthEventType."""
from platform_shared.core.auth_events import AuthEventType


class TestAuthEventTypeConstants:
    def test_login_constants(self) -> None:
        assert AuthEventType.LOGIN_SUCCESS == "login.success"
        assert AuthEventType.LOGIN_FAILURE == "login.failure"
        assert AuthEventType.LOGIN_BLOCKED_LOCKED == "login.blocked.locked"
        assert AuthEventType.LOGIN_BLOCKED_UNVERIFIED == "login.blocked.unverified"
        assert AuthEventType.LOGIN_BLOCKED_RATE_LIMIT == "login.blocked.rate_limit"

    def test_register_and_verify_constants(self) -> None:
        assert AuthEventType.REGISTER_SUCCESS == "register.success"
        assert AuthEventType.EMAIL_VERIFY_SUCCESS == "email_verify.success"
        assert AuthEventType.EMAIL_VERIFY_RESEND == "email_verify.resend"

    def test_password_constants(self) -> None:
        assert AuthEventType.PASSWORD_RESET_REQUEST == "password_reset.request"
        assert AuthEventType.PASSWORD_RESET_SUCCESS == "password_reset.success"
        assert AuthEventType.PASSWORD_CHANGE_SUCCESS == "password_change.success"

    def test_totp_constants(self) -> None:
        assert AuthEventType.TOTP_ENABLED == "totp.enabled"
        assert AuthEventType.TOTP_DISABLED == "totp.disabled"
        assert AuthEventType.TOTP_VERIFY_SUCCESS == "totp.verify.success"
        assert AuthEventType.TOTP_VERIFY_FAILURE == "totp.verify.failure"
        assert AuthEventType.TOTP_RECOVERY_USED == "totp.recovery.used"

    def test_oauth_constants(self) -> None:
        assert AuthEventType.OAUTH_CONNECT == "oauth.connect"
        assert AuthEventType.OAUTH_DISCONNECT == "oauth.disconnect"

    def test_account_lifecycle_constants(self) -> None:
        assert AuthEventType.ACCOUNT_DELETED == "account.deleted"
        assert AuthEventType.DATA_EXPORTED == "data.exported"

    def test_constants_are_unique(self) -> None:
        """Every AuthEventType value must be unique — duplicates would corrupt audit queries."""
        values = [
            getattr(AuthEventType, name)
            for name in dir(AuthEventType)
            if not name.startswith("_") and isinstance(getattr(AuthEventType, name), str)
        ]
        assert len(values) == len(set(values)), f"Duplicate auth-event values: {values}"
