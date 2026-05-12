"""MyGamingAssistant application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only MGA-specific fields
(seed user for single-user mode, lineup limits) live here.

Single-user design: registration is disabled at the route level. On first
boot the lifespan seeds one user from SEED_USER_EMAIL + SEED_USER_PASSWORD_HASH.
The full Tier-1 auth shell (TOTP, lockout, audit) is preserved so security
primitives never need to be re-added if this app ever becomes multi-user.
"""

from pydantic import Field

from platform_shared.core.settings import BaseAppSettings


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # MGA-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 1800  # 30 min — same as MJH
    frontend_url: str = "http://localhost:5176"
    cors_origins: list[str] = ["http://localhost:5176"]
    minio_bucket: str = "mygamingassistant-screenshots"
    email_from_name: str = "MyGamingAssistant"

    # ------------------------------------------------------------------
    # Single-user seed (MGA-specific — no equivalent in MBK/MJH).
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
    # MGA AI (Claude classifier for lineup extraction — Phase 5)
    # Optional in Phase 1; required when the classifier is wired in.
    # ------------------------------------------------------------------
    anthropic_api_key: str = ""

    # ------------------------------------------------------------------
    # Per-IP login throttle — matches MJH defaults
    # ------------------------------------------------------------------
    login_rate_limit_threshold: int = 10
    login_rate_limit_window_seconds: int = 300

    # ------------------------------------------------------------------
    # TOTP enrollment branding — baked into the otpauth:// URI.
    # Ship-once-forever constants; changing them orphans existing enrollments.
    # ------------------------------------------------------------------
    totp_label: str = "MyGamingAssistant"
    totp_issuer: str = "MyGamingAssistant"

    # ------------------------------------------------------------------
    # Lineup limits
    # ------------------------------------------------------------------
    max_lineup_screenshot_bytes: int = 10 * 1024 * 1024  # 10 MB per screenshot


settings = Settings()
