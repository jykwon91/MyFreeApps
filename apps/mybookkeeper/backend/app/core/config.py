from pydantic import field_validator
from pydantic_settings import BaseSettings

_MIN_KEY_LENGTH = 32


class Settings(BaseSettings):
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
                f"python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v
    anthropic_api_key: str
    google_client_id: str
    google_client_secret: str
    oauth_redirect_uri: str = "http://localhost:8000/integrations/gmail/callback"
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]
    jwt_lifetime_seconds: int = 60 * 60 * 24  # 24 hours
    gmail_poll_interval_minutes: int = 1440
    gmail_search_query: str = "subject:invoice OR subject:receipt OR subject:payment OR subject:payout OR subject:billing OR subject:statement OR subject:booking OR subject:report OR subject:financial OR has:attachment"
    max_uploads_per_user_per_day: int = 50
    max_upload_size_bytes: int = 100 * 1024 * 1024  # 100MB (supports zip uploads)
    max_text_chars: int = 20000
    max_email_body_chars: int = 8000
    max_spreadsheet_chars: int = 8000
    claude_timeout_seconds: float = 600.0  # 10 min per extraction call
    email_fetch_timeout_seconds: int = 120
    email_extraction_timeout_seconds: int = 120
    run_upload_worker: bool = True
    demo_max_uploads_per_day: int = 5

    minio_endpoint: str = ""
    minio_public_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "mybookkeeper-files"
    minio_secure: bool = False
    presigned_url_ttl_seconds: int = 3600
    max_blackout_attachment_size_bytes: int = 25 * 1024 * 1024  # 25 MB

    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_environment: str = "sandbox"
    plaid_webhook_url: str = ""

    gmail_label: str = ""

    sentry_dsn: str = ""
    posthog_api_key: str = ""

    allow_test_admin_promotion: bool = False

    hibp_enabled: bool = True

    lockout_threshold: int = 5
    lockout_autoreset_hours: int = 24

    turnstile_secret_key: str = ""

    # ----- Public inquiry form (T0) -----
    # Score threshold for the Claude spam-scoring step. Inquiries scoring
    # below this are stored as ``spam`` and never surface to the operator's
    # default inbox tab. Operator-tunable in MBK Settings → Inquiries.
    inquiry_spam_threshold: int = 30
    # Master switch for the disposable-email gate (filter step 5).
    inquiry_block_disposable_email: bool = True
    # Per-IP rate limit for ``POST /api/inquiries/public`` (filter step 1).
    inquiry_public_rate_limit_max: int = 5
    inquiry_public_rate_limit_window_seconds: int = 3600
    # Minimum-character soft gate for the ``why_this_room`` text field
    # (filter step 9). Lowered/raised by the operator if spam patterns shift.
    inquiry_min_why_this_room_chars: int = 30

    email_from_address: str = "mybookkeeper6@gmail.com"
    email_from_name: str = "MyBookkeeper"

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    cost_alert_recipients: str = ""

    app_url: str = ""
    admin_api_key: str = ""

    cost_input_rate_per_million: float = 3.0
    cost_output_rate_per_million: float = 15.0
    cost_daily_budget: float = 50.0
    cost_monthly_budget: float = 1000.0
    cost_per_user_daily_alert: float = 10.0

    @property
    def database_url_sync(self) -> str:
        return self.database_url.replace("+asyncpg", "")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
