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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
