from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    database_url_sync: str
    secret_key: str
    encryption_key: str

    anthropic_api_key: str = ""
    tavily_api_key: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    cors_origins: list[str] = ["http://localhost:5175"]
    jwt_lifetime_seconds: int = 1800  # 30 minutes
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

    # TOTP enrollment branding (PR C5) — these strings are baked into the
    # ``otpauth://`` provisioning URI (and therefore into every QR code a
    # user scans). Once a user enrols, their authenticator app keeps these
    # values forever; changing them here would NOT migrate the user's
    # existing entry, it would just cause duplicate / orphaned entries on
    # next enrollment. Treat them as ship-once-forever constants.
    totp_label: str = "MyJobHunter"
    totp_issuer: str = "MyJobHunter"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
