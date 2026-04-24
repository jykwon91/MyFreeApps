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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
