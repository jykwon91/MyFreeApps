"""MyRecipes application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only app-specific fields
(app-level toggles) live here.

Multi-user design: public registration is enabled, mirroring the canonical
app (MyBookkeeper). New accounts verify their email before first login, and
every recipe row is scoped per-user. The full Tier-1 auth shell (TOTP,
lockout, HIBP, Turnstile, audit) is inherited from platform_shared.
"""

from platform_shared.core.settings import BaseAppSettings


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # App-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 1800  # 30 min
    frontend_url: str = "http://localhost:5180"
    cors_origins: list[str] = ["http://localhost:5180"]
    minio_bucket: str = "myrecipes-uploads"
    email_from_name: str = "MyRecipes"

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
    totp_label: str = "MyRecipes"
    totp_issuer: str = "MyRecipes"


settings = Settings()
