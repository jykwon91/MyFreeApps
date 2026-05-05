"""Base settings class for MyFreeApps backend apps.

App-specific Settings classes inherit from BaseAppSettings and add their
domain fields. The base provides every field that is structurally common
across the platform — auth, CORS, lockout, HIBP, Turnstile, email, MinIO,
Sentry — with defaults chosen so the model validates in dev/CI without
hand-setting each one.

Fields where the *default* legitimately differs per app (port numbers in
URLs, brand-name strings, bucket names) are declared here with a sane
placeholder; app subclasses override them. Fields that one app currently
needs and another doesn't are kept in the app subclass — adding them to
the base would force unrelated apps to ship code paths they don't use.

Inheritance shape:

    from platform_shared.core.settings import BaseAppSettings

    class Settings(BaseAppSettings):
        anthropic_api_key: str = ""        # MJH-app-specific
        plaid_client_id: str = ""           # MBK-app-specific
        ...

    settings = Settings()

Pydantic v2 inheritance: model_config is inherited. Subclasses can extend
the env_file or set model_config = {**BaseAppSettings.model_config, ...}
to layer additional config — but the default already does the right thing.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings

_MIN_KEY_LENGTH = 32


class BaseAppSettings(BaseSettings):
    """Common settings for every MyFreeApps backend app."""

    # ------------------------------------------------------------------
    # Required core — every app needs these or it doesn't boot.
    # No defaults; missing values raise at startup.
    # ------------------------------------------------------------------
    database_url: str
    secret_key: str
    encryption_key: str

    @field_validator("secret_key", "encryption_key")
    @classmethod
    def _validate_key_length(cls, v: str, info: object) -> str:
        if len(v) < _MIN_KEY_LENGTH:
            field = getattr(info, "field_name", "key")
            raise ValueError(
                f"{field} must be at least {_MIN_KEY_LENGTH} characters "
                f"(got {len(v)}). Generate a strong key with: "
                f'python -c "import secrets; print(secrets.token_hex(32))"'
            )
        return v

    @property
    def database_url_sync(self) -> str:
        """Sync driver variant for Alembic migrations."""
        return self.database_url.replace("+asyncpg", "")

    # ------------------------------------------------------------------
    # Auth / session
    # ------------------------------------------------------------------
    # JWT lifetime in seconds. Apps override per their security posture.
    jwt_lifetime_seconds: int = 1800  # 30 min

    # ------------------------------------------------------------------
    # HTTP / CORS — apps override frontend_url and cors_origins with the
    # right port. Defaults below keep validation clean in dev/CI.
    # ------------------------------------------------------------------
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]

    # ------------------------------------------------------------------
    # Account-level login lockout (platform_shared.services.account_lockout)
    # ------------------------------------------------------------------
    lockout_threshold: int = 5
    lockout_autoreset_hours: int = 24

    # ------------------------------------------------------------------
    # Compromised-password check (HIBP k-anonymity range API).
    # Set to false in local dev/CI to skip the network call.
    # ------------------------------------------------------------------
    hibp_enabled: bool = True

    # ------------------------------------------------------------------
    # Cloudflare Turnstile CAPTCHA. Empty secret = no-op dev/CI mode;
    # production must set both keys. The boot-time guard in
    # platform_shared (future tier) raises if environment="production"
    # and turnstile_secret_key is empty.
    # ------------------------------------------------------------------
    turnstile_secret_key: str = ""
    turnstile_site_key: str = ""

    # ------------------------------------------------------------------
    # Email delivery
    # email_backend = "console" prints to stdout (dev/CI default);
    # "smtp" sends via the configured SMTP server.
    # email_from_name: apps override with their brand string.
    # ------------------------------------------------------------------
    email_backend: str = "console"
    email_from_address: str = ""
    email_from_name: str = "MyFreeApps"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # ------------------------------------------------------------------
    # MinIO object storage
    # Apps override minio_bucket with their per-app bucket name.
    # minio_skip_startup_check is dev-only — production should always
    # leave it false so a missing bucket fails loudly at boot.
    # ------------------------------------------------------------------
    minio_endpoint: str = ""
    minio_public_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = ""
    minio_secure: bool = False
    presigned_url_ttl_seconds: int = 3600
    minio_skip_startup_check: bool = False

    # ------------------------------------------------------------------
    # Deployment environment + observability
    # environment ∈ {"development", "test", "staging", "production"}.
    # sentry_dsn empty in non-production is fine; empty in production
    # raises at boot via init_sentry() (future Tier-1 PR).
    # ------------------------------------------------------------------
    environment: str = "development"
    sentry_dsn: str = ""

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "extra": "ignore"}
