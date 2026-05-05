"""MyBookkeeper application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only MBK-specific fields
(Plaid, Gmail integration, document extraction, cost accounting,
inquiry filters, etc.) live here.
"""

from platform_shared.core.settings import BaseAppSettings


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # MBK-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 60 * 60 * 24  # 24 hours
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]
    minio_bucket: str = "mybookkeeper-files"
    email_from_address: str = "mybookkeeper6@gmail.com"
    email_from_name: str = "MyBookkeeper"
    # MBK historically hardcoded SMTP — opt in by default. Operators
    # who want to silence outbound mail in a local sandbox can override
    # to "console" via .env.docker.
    email_backend: str = "smtp"
    smtp_host: str = "smtp.gmail.com"

    # ------------------------------------------------------------------
    # Required MBK app keys (no default — must be set in env)
    # ------------------------------------------------------------------
    anthropic_api_key: str
    google_client_id: str
    google_client_secret: str

    # ------------------------------------------------------------------
    # Gmail integration
    # ------------------------------------------------------------------
    oauth_redirect_uri: str = "http://localhost:8000/integrations/gmail/callback"
    gmail_poll_interval_minutes: int = 1440
    # Gmail search filter applied at API-list time. Anything that doesn't
    # match never gets fetched, so the categories here define the full
    # universe MBK can react to:
    #   - Document-extractor patterns (invoice/receipt/billing/etc.)
    #   - Airbnb host payouts (subject:payout)
    #   - Peer-to-peer rent payments (Zelle/Venmo/Cash App/PayPal/Apple Pay)
    #     across multiple banks (Chase, BoA, Wells, Citi, Capital One, etc.)
    gmail_search_query: str = (
        # --- Document-extractor patterns ------------------------------------
        "subject:invoice OR subject:receipt OR subject:payment OR subject:payout OR "
        "subject:billing OR subject:statement OR subject:booking OR subject:report OR "
        "subject:financial OR has:attachment OR "
        # --- Peer-to-peer payment subjects ----------------------------------
        # Platform-named subjects
        "subject:zelle OR subject:venmo OR subject:\"cash app\" OR "
        "subject:cashapp OR subject:paypal OR subject:\"apple pay\" OR "
        # Generic money-movement phrases — catches forwarded subjects too
        # ("Fwd: ..." prefix doesn't break Gmail subject token matching)
        "subject:\"received money\" OR subject:\"sent you money\" OR "
        "subject:\"sent you\" OR subject:\"paid you\" OR "
        "subject:\"you received\" OR subject:\"you got paid\" OR "
        "subject:\"deposit alert\" OR subject:\"transfer received\" OR "
        # --- Peer-to-peer payment senders -----------------------------------
        # Standalone platforms
        "from:zellepay.com OR from:venmo.com OR from:cash.app OR "
        "from:paypal.com OR from:square.com OR "
        # Bank-routed Zelle / deposit alerts (major US issuers)
        "from:no.reply.alerts@chase.com OR from:alerts.chase.com OR "
        "from:ealerts.bankofamerica.com OR from:notify.wellsfargo.com OR "
        "from:notification.capitalone.com OR from:alerts.citibank.com OR "
        "from:usaa.com OR from:alerts.usbank.com OR from:pncalerts.com OR "
        # --- Body-text fallback (catches forwarded P2P notifications) -------
        # ``subject:zelle`` doesn't match "Fwd: You received money with Zelle®"
        # — Gmail's subject tokenizer appears to keep the ® glyph attached
        # to the word, so the token is "Zelle®" not "Zelle". Bare-word and
        # bare-phrase search clauses (no ``subject:`` prefix) cover body +
        # subject + headers, so the phrases below match the *body* of a
        # Chase/Venmo/Cash-App notification email even when the subject
        # tokenizer fails. Phrases are chosen to be specific to payment
        # notifications, NOT marketing copy.
        "\"sent you money with zelle\" OR \"with zelle®\" OR "
        "\"received money with zelle\" OR \"venmo payment received\" OR "
        "\"you received\" OR \"sent you money\""
    )
    gmail_label: str = ""

    # ------------------------------------------------------------------
    # Document upload / extraction
    # ------------------------------------------------------------------
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
    max_blackout_attachment_size_bytes: int = 25 * 1024 * 1024  # 25 MB

    # ------------------------------------------------------------------
    # Plaid integration
    # ------------------------------------------------------------------
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_environment: str = "sandbox"
    plaid_webhook_url: str = ""

    # ------------------------------------------------------------------
    # Analytics
    # ------------------------------------------------------------------
    posthog_api_key: str = ""

    # ------------------------------------------------------------------
    # Test / admin escape hatches — never set true in production
    # ------------------------------------------------------------------
    allow_test_admin_promotion: bool = False

    # ------------------------------------------------------------------
    # Public inquiry form filters (T0 spam controls)
    # ------------------------------------------------------------------
    inquiry_spam_threshold: int = 30
    inquiry_block_disposable_email: bool = True
    inquiry_public_rate_limit_max: int = 5
    inquiry_public_rate_limit_window_seconds: int = 3600
    inquiry_min_why_this_room_chars: int = 30

    # ------------------------------------------------------------------
    # Cost accounting + alerts
    # ------------------------------------------------------------------
    cost_alert_recipients: str = ""
    cost_input_rate_per_million: float = 3.0
    cost_output_rate_per_million: float = 15.0
    cost_daily_budget: float = 50.0
    cost_monthly_budget: float = 1000.0
    cost_per_user_daily_alert: float = 10.0

    # ------------------------------------------------------------------
    # App URL (used in email links) + admin API key
    # ------------------------------------------------------------------
    app_url: str = ""
    admin_api_key: str = ""


settings = Settings()
