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

    # Account-level login lockout (PR C3 — wires platform_shared.services.account_lockout)
    lockout_threshold: int = 5
    lockout_autoreset_hours: int = 24

    # Per-IP login throttle (PR C3 — wires platform_shared.core.rate_limit)
    login_rate_limit_threshold: int = 10
    login_rate_limit_window_seconds: int = 300

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
