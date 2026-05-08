"""MyJobHunter application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only MJH-specific fields
(Tavily research API, TOTP branding, login throttle, resume upload
limits) live here.
"""

from platform_shared.core.settings import BaseAppSettings


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # MJH-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 1800  # 30 min — stricter than MBK's 24h
    frontend_url: str = "http://localhost:5174"
    cors_origins: list[str] = ["http://localhost:5175"]
    minio_bucket: str = "myjobhunter-files"
    email_from_name: str = "MyJobHunter"

    # ------------------------------------------------------------------
    # MJH AI integrations (optional in Phase 1; required in later phases)
    # ------------------------------------------------------------------
    anthropic_api_key: str = ""
    tavily_api_key: str = ""

    # JSearch (RapidAPI / Google Jobs aggregator) — wraps LinkedIn /
    # Indeed / Glassdoor / ZipRecruiter / Dice into one structured JSON
    # endpoint. Used by the discovery worker (Phase 4+). Empty in dev;
    # required in production for the discovery feature to fetch.
    jsearch_api_key: str = ""

    # /discover scoring budget (Phase C). The per-user daily cap is the
    # smaller of these two values. ``discovery_daily_budget_usd`` is the
    # default operator-friendly cap; ``..._hard_cap`` is the absolute
    # ceiling no per-profile override may exceed.
    discovery_daily_budget_usd: float = 0.30
    discovery_daily_budget_usd_hard_cap: float = 2.00

    # /discover refresh rate-limit (per IP). JSearch is paid; cap how
    # often an operator can hit /refresh in a window to bound runaway
    # cost from a stuck retry loop or a leaked credential. Defaults
    # mirror the previous hardcoded values in api/discover.py.
    discovery_refresh_rate_limit_threshold: int = 30
    discovery_refresh_rate_limit_window_seconds: int = 300

    # ------------------------------------------------------------------
    # Google OAuth (Gmail integration — Phase 3)
    # ------------------------------------------------------------------
    google_client_id: str = ""
    google_client_secret: str = ""

    # ------------------------------------------------------------------
    # Per-IP login throttle (PR C3 — wires platform_shared.core.rate_limit)
    # ------------------------------------------------------------------
    login_rate_limit_threshold: int = 10
    login_rate_limit_window_seconds: int = 300

    # ------------------------------------------------------------------
    # TOTP enrollment branding (PR C5) — baked into the otpauth:// URI.
    # Ship-once-forever constants; changing them orphans existing
    # user enrollments.
    # ------------------------------------------------------------------
    totp_label: str = "MyJobHunter"
    totp_issuer: str = "MyJobHunter"

    # ------------------------------------------------------------------
    # Resume upload limits — generous for legitimate PDF/DOCX resumes,
    # bounded to prevent storage abuse.
    # ------------------------------------------------------------------
    max_resume_upload_bytes: int = 25 * 1024 * 1024  # 25 MB


settings = Settings()
