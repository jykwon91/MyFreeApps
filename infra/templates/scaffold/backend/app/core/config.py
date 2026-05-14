"""__APP_DISPLAY_NAME__ application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only app-specific fields
(seed user for single-user mode, app-level toggles) live here.

Single-user design: registration is disabled at the route level. On first
boot the lifespan seeds one user from SEED_USER_EMAIL + SEED_USER_PASSWORD_HASH.
The full Tier-1 auth shell (TOTP, lockout, audit) is preserved so security
primitives never need to be re-added if this app ever becomes multi-user.
"""

from platform_shared.core.settings import BaseAppSettings


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # App-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 1800  # 30 min
    frontend_url: str = "http://localhost:__FRONTEND_DEV_PORT__"
    cors_origins: list[str] = ["http://localhost:__FRONTEND_DEV_PORT__"]
    minio_bucket: str = "__APP_SLUG__-uploads"
    email_from_name: str = "__APP_DISPLAY_NAME__"

    # ------------------------------------------------------------------
    # Single-user seed.
    # On first boot the lifespan creates this user if it doesn't exist.
    # In production both fields are required (boot guard fires if empty).
    # In dev/CI leave empty and the seed is skipped with a WARNING log.
    # ------------------------------------------------------------------
    seed_user_email: str = ""
    # bcrypt hash of the seed user's password. Generate via:
    #   python -c "from passlib.context import CryptContext; \
    #     ctx = CryptContext(schemes=['bcrypt']); \
    #     print(ctx.hash('your-password'))"
    seed_user_password_hash: str = ""

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
    totp_label: str = "__APP_DISPLAY_NAME__"
    totp_issuer: str = "__APP_DISPLAY_NAME__"


settings = Settings()
