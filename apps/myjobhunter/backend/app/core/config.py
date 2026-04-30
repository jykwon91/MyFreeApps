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

    # Frontend URL used to build links in transactional emails
    frontend_url: str = "http://localhost:5174"

    # Email delivery — "console" prints to stdout (dev/CI), "smtp" sends via SMTP
    email_backend: str = "console"
    email_from_name: str = "MyJobHunter"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
