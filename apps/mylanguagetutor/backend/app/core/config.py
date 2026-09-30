"""MyLanguageTutor application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only app-specific fields
(app-level toggles) live here.

Multi-user design: public registration is enabled, mirroring the canonical
app (MyBookkeeper). New accounts verify their email before first login, and
every tutor session / turn row is scoped per-user. The full Tier-1 auth shell (TOTP,
lockout, HIBP, Turnstile, audit) is inherited from platform_shared.
"""

from platform_shared.core.settings import BaseAppSettings


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # App-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 1800  # 30 min
    frontend_url: str = "http://localhost:5182"
    cors_origins: list[str] = ["http://localhost:5182"]
    minio_bucket: str = "mylanguagetutor-uploads"
    email_from_name: str = "MyLanguageTutor"

    # ------------------------------------------------------------------
    # Test-only helpers — never set in production.
    # When true, /api/_test/* endpoints are mounted (rate-limit reset).
    # ------------------------------------------------------------------
    app_enable_test_helpers: bool = False

    # ------------------------------------------------------------------
    # Per-IP login throttle
    # ------------------------------------------------------------------
    login_rate_limit_threshold: int = 10
    login_rate_limit_window_seconds: int = 300

    # ------------------------------------------------------------------
    # TOTP enrollment branding — baked into the otpauth:// URI.
    # Ship-once-forever constants; changing them orphans existing enrollments.
    # ------------------------------------------------------------------
    totp_label: str = "MyLanguageTutor"
    totp_issuer: str = "MyLanguageTutor"

    # ------------------------------------------------------------------
    # Claude (the tutor). Every conversation turn is a Claude call, so the
    # lifespan fails loud in production when the key is missing
    # (platform_shared.core.boot_guards.check_extraction_configured).
    # Model ids live here -- never hardcoded in services -- so the operator
    # can swap them with LTUTOR_*_MODEL env vars without a deploy of code.
    # ------------------------------------------------------------------
    anthropic_api_key: str = ""
    # Spoken reply: streamed plain text, latency-critical -> small fast model.
    ltutor_reply_model: str = "claude-haiku-4-5"
    # Corrections + scenario progress: structured JSON, off the critical path.
    ltutor_corrections_model: str = "claude-sonnet-5"
    # English translation of the tutor's reply (collapsed in the UI).
    ltutor_translation_model: str = "claude-haiku-4-5"
    ltutor_reply_max_tokens: int = 400
    ltutor_corrections_max_tokens: int = 1200
    ltutor_translation_max_tokens: int = 300

    # ------------------------------------------------------------------
    # Turn limits (abuse + cost bounds). The 500-char cap on one learner
    # turn is a schema constant (app/schemas/tutor/turn_schemas.py).
    # ------------------------------------------------------------------
    ltutor_max_turns_per_session: int = 40
    # Previous turns replayed to the reply model as context.
    ltutor_history_turns: int = 20
    # In-process burst limiter per user (the durable caps are below).
    ltutor_turns_per_minute: int = 30

    # ------------------------------------------------------------------
    # Daily cost caps, in COST UNITS.
    #
    # 1 unit = the price of one uncached claude-haiku-4-5 input token
    # ($1 / MTok -> 1 unit = $0.000001). A call's cost in units is
    #
    #   weight x (uncached_in + 0.1 x cache_read + 1.25 x cache_write + 5 x output)
    #
    # (Anthropic's cache-read / cache-write / output multipliers relative to
    # base input). weight = the model's input price relative to Haiku 4.5:
    # Haiku 4.5 = 1; Sonnet 5 = 2 per the operator's pricing note -- re-check
    # https://www.anthropic.com/pricing and adjust
    # LTUTOR_CORRECTIONS_UNIT_WEIGHT if the price differs.
    #
    # Budget: $20 / month total ~= $0.658 / day -> global cap 650,000 units.
    # A typical turn costs ~$0.008 (Haiku reply ~$0.004 + Sonnet corrections
    # ~$0.0035 + Haiku translation ~$0.0005) = ~8,000 units, so the per-user
    # cap of 250,000 units ~= 30 turns / day (~$0.25).
    #
    # Each turn RESERVES an upper-bound estimate (input estimate + max_tokens
    # of every call) before calling Claude and reconciles to actual usage
    # afterwards, so these caps are never overshot by in-flight turns.
    # LTUTOR_GLOBAL_DAILY_UNITS=0 is the kill switch: every turn -> 503
    # tutor_unavailable. Also set the Anthropic console spend limit (~$20/mo).
    # ------------------------------------------------------------------
    ltutor_user_daily_units: int = 250_000
    ltutor_global_daily_units: int = 650_000
    ltutor_reply_unit_weight: float = 1.0
    ltutor_corrections_unit_weight: float = 2.0
    ltutor_translation_unit_weight: float = 1.0


settings = Settings()
