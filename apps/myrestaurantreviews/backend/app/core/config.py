from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    encryption_key: str
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]
    jwt_lifetime_seconds: int = 60 * 60 * 24  # 24 hours

    sentry_dsn: str = ""

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from_name: str = "MyRestaurantReviews"

    turnstile_secret_key: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
