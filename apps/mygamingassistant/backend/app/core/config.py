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
    # MGA AI (Claude classifier for lineup extraction — PR 5+)
    # ANTHROPIC_API_KEY is required when ENABLE_CLASSIFIER=true.
    # Boot guard fires at startup if key is missing and classifier enabled.
    # Override CLAUDE_CLASSIFIER_MODEL in dev/test to use a cheaper model.
    # ------------------------------------------------------------------
    anthropic_api_key: str = ""
    claude_classifier_model: str = "claude-haiku-4-5-20251001"
    # Set ENABLE_CLASSIFIER=false to land lineups without auto-classification.
    # When false, lineups arrive in pending_review with no suggestions.
    enable_classifier: bool = True

    # ------------------------------------------------------------------
    # Test-only helpers — never set in production.
    # When true, /api/_test/* endpoints are mounted (rate-limit reset,
    # seed lineup for E2E tests). Guarded by the mga_enable_test_helpers flag.
    # ------------------------------------------------------------------
    mga_enable_test_helpers: bool = False

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

    # ------------------------------------------------------------------
    # Ingestion pipeline (PR 4+)
    # ------------------------------------------------------------------
    # Directory where yt-dlp downloads video files before ffmpeg extraction.
    # The ingestion orchestrator cleans up files after processing each video.
    # Ensure this path has >= INGESTION_DOWNLOAD_DIR_MAX_GB of free space.
    ingestion_download_dir: str = "/tmp/mga-ingestion"
    # Disk cap in GB — ingestion refuses to start if free space falls below this.
    # Operator can raise this if they have more disk; lower values are risky
    # for long-form videos (CS2 full-map videos can exceed 1 GB each).
    ingestion_download_dir_max_gb: int = 10

    # ------------------------------------------------------------------
    # Pane-editor wide-source window (for the trim editor)
    # ------------------------------------------------------------------
    # Seconds of padding kept BEFORE the chapter when extracting the
    # ``*_url_original`` source clip the trim editor reads from. The operator
    # can drag the trim slider into this pre-chapter padding to grab frames
    # the original ingest cut left behind (typical use: 1-2s of approach /
    # setup that the chapter title misses).
    clip_source_pre_seconds: float = 15.0
    # Seconds of padding kept AFTER the chapter, symmetric to the pre-padding
    # above. Same purpose: lets the trim editor extend past the original
    # ingest cut. 15s mirrors the pre-padding so the editor's slider feels
    # symmetric around the chapter.
    clip_source_post_seconds: float = 15.0

    # ------------------------------------------------------------------
    # Scheduler (PR 6+)
    # ------------------------------------------------------------------
    # Set SCHEDULER_ENABLED=false to disable the background cron entirely
    # (useful for tests and local dev where you don't want background jobs).
    # In production, if SCHEDULER_ENABLED=true and sources exist but the
    # scheduler fails to start, the lifespan fails loudly.
    scheduler_enabled: bool = True
    # Interval in hours between full source sync passes.
    # Each pass iterates all active sources sequentially.
    source_sync_interval_hours: int = 6


settings = Settings()
