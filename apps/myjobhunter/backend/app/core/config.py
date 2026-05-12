"""MyJobHunter application settings.

Inherits all common platform fields (database, auth, CORS, lockout, HIBP,
Turnstile, email, MinIO, Sentry, logging) from
platform_shared.core.settings.BaseAppSettings. Only MJH-specific fields
(Tavily research API, TOTP branding, login throttle, resume upload
limits) live here.
"""

from pydantic import Field

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

    # /discover scoring top-N (PR 4b). After the cosine-similarity
    # prefilter ranks unscored postings by relevance to the user's
    # profile embedding, only the top N are sent to Anthropic per
    # scoring pass. 20 is a sweet spot: ~25x cost reduction at 500
    # postings/day while keeping a deep-enough cut that the operator
    # rarely runs out of fresh high-relevance scored rows. Tune up if
    # the budget headroom is available and the operator wants more
    # scored rows per pass; tune down if Anthropic latency dominates.
    discovery_score_top_n: int = 20

    # /discover refresh rate-limit (per IP). JSearch is paid; cap how
    # often an operator can hit /refresh in a window to bound runaway
    # cost from a stuck retry loop or a leaked credential. Defaults
    # mirror the previous hardcoded values in api/discover.py.
    discovery_refresh_rate_limit_threshold: int = 30
    discovery_refresh_rate_limit_window_seconds: int = 300

    # Number of JSearch pages to retrieve per saved-search fetch cycle.
    # JSearch charges 1 RapidAPI request per page; each page returns ~10
    # postings. At the default of 5 pages (~50 postings per fetch), one
    # operator with 5 saved searches fetching once per day uses ~750
    # req/month — well within the Pro tier ($9.99/mo, 10k req/mo).
    # Floor: 1 (minimum useful fetch). Ceiling: 20 (hard cost guard;
    # 20 pages × 10 searches × 2 fetches/day = 4k req/month, still
    # within Pro). Tune down if you want to conserve budget; tune up if
    # you want deeper result diversity.
    discovery_jsearch_pages_per_fetch: int = Field(default=5, ge=1, le=20)

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
