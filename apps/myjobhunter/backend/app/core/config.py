from pydantic import field_validator
from pydantic_settings import BaseSettings

_MIN_KEY_LENGTH = 32


class Settings(BaseSettings):
    database_url: str
    database_url_sync: str
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
                f"python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    anthropic_api_key: str = ""
    tavily_api_key: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    cors_origins: list[str] = ["http://localhost:5175"]
    jwt_lifetime_seconds: int = 1800
    log_level: str = "INFO"

    # HIBP compromised-password check (k-anonymity range API).
    # Default true; set to false in local dev / CI to skip the network call.
    hibp_enabled: bool = True

    # Cloudflare Turnstile CAPTCHA — wired on /auth/register and /auth/forgot-password.
    # Empty secret = no-op (dev / CI mode); the require_turnstile dependency
    # short-circuits to allow the request through.
    turnstile_secret_key: str = ""
    turnstile_site_key: str = ""

    # Account-level login lockout (PR C3 — wires platform_shared.services.account_lockout)
    lockout_threshold: int = 5
    lockout_autoreset_hours: int = 24

    # Per-IP login throttle (PR C3 — wires platform_shared.core.rate_limit)
    login_rate_limit_threshold: int = 10
    login_rate_limit_window_seconds: int = 300

    # Frontend URL used to build links in transactional emails (PR C4)
    frontend_url: str = "http://localhost:5174"

    # Email delivery — "console" prints to stdout (dev/CI), "smtp" sends via SMTP
    email_backend: str = "console"
    email_from_name: str = "MyJobHunter"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # TOTP enrollment branding (PR C5) — baked into the otpauth:// URI.
    # Ship-once-forever constants; changing them orphans existing user enrollments.
    totp_label: str = "MyJobHunter"
    totp_issuer: str = "MyJobHunter"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
