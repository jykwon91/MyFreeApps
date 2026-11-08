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


from pydantic import field_validator

from platform_shared.core.settings import BaseAppSettings

from app.core.triage_tokens import TriageToken, parse_triage_tokens


class Settings(BaseAppSettings):
    # ------------------------------------------------------------------
    # Serve-only deployment mode (env: SERVE_ONLY).
    # ------------------------------------------------------------------
    # When True, MGA runs as a PURE PUBLIC READ-ONLY lineup library with
    # ZERO authentication:
    #   - No login / JWT-auth / reset-password / verify / TOTP routes are
    #     mounted (they return 404 — fail closed: auth routes are ABSENT,
    #     never present-but-bypassed).
    #   - No auth-write surface (lineup/package/source/scheduler/admin
    #     mutations, /users/me) is mounted.
    #   - The seed-operator user is NOT created and SEED_USER_* env vars are
    #     NOT required at boot.
    #   - The Turnstile + email boot guards are skipped (no forgot-password
    #     form exists with no auth), so TURNSTILE_* / EMAIL_*/SMTP_* env are
    #     NOT required.
    # Only the public-read surface (games, accepted lineups, packages,
    # health, version) is served. This is the production shape: the operator
    # authors lineups LOCALLY (full auth) and seeds prod via the
    # ``import-lineups`` CLI; prod only ever serves the public library.
    #
    # When False (the default — local dev / CI), MGA keeps its full
    # public-read / auth-write behavior unchanged: every auth + write route
    # is mounted and the seed user + boot guards behave exactly as today.
    #
    # The matching frontend build flag is VITE_SERVE_ONLY (wired through the
    # docker build-args chain — see docker/caddy.Dockerfile + docker-compose.yml).
    serve_only: bool = False

    # ------------------------------------------------------------------
    # MGA-specific overrides of base defaults
    # ------------------------------------------------------------------
    jwt_lifetime_seconds: int = 1800  # 30 min — same as MJH
    frontend_url: str = "http://localhost:5176"
    cors_origins: list[str] = ["http://localhost:5176"]
    minio_bucket: str = "mygamingassistant-screenshots"
    email_from_name: str = "MyGamingAssistant"

    # ------------------------------------------------------------------
    # Public object base URL for the lineup library (R2 read serving).
    # EMPTY is the current production mode: clip/screenshot read URLs are
    # PRESIGNED against the R2 S3 endpoint (always reachable; CSP already allows
    # *.r2.cloudflarestorage.com). Only accepted/public clips reach prod and the
    # API presigns each URL per request — no edge cache, but R2 egress is free.
    #
    # Set this ONLY to a BOUND R2 custom domain (e.g. https://mga-clips.myfreeapps.org):
    # read URLs then become plain CDN URLs ``{base}/{key}`` (unsigned, edge-cached).
    # Binding requires the myfreeapps.org DNS zone on Cloudflare, which it is not
    # (Porkbun) — so this stays empty until the zone migration tracked in
    # apps/mygamingassistant/TECH_DEBT.md. An unbound value dead-links every clip;
    # the lifespan now fails loud at boot if the host does not resolve (see
    # app/core/media_public_base_url_guard.py). Also empty in local
    # dev / CI, where storage is MinIO. See lineup_url_signing._sign_screenshot_url.
    # ------------------------------------------------------------------
    minio_public_base_url: str = ""

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
    # WoW Forever item reader (POST /wow/items/extract — PUBLIC, both modes).
    # Reads an in-game item tooltip (screenshot or pasted text) into
    # structured stats with Claude. Reuses ANTHROPIC_API_KEY. Anonymous in
    # serve-only prod, so it is gated by (in order): availability → per-IP
    # limit → Turnstile → input validation → durable global daily cap.
    # Deliberately NO boot guard: without ANTHROPIC_API_KEY (or, in serve-only
    # / production, without TURNSTILE_SECRET_KEY) the endpoint answers 503
    # ``item_reader_unavailable`` and the UI falls back to manual entry.
    # Scoring is deterministic frontend code, not AI.
    # ------------------------------------------------------------------
    claude_item_extractor_model: str = "claude-haiku-4-5-20251001"
    item_extract_max_image_bytes: int = 5 * 1024 * 1024  # 5 MB
    item_extract_max_text_chars: int = 4000
    # Per-IP throttle (in-process; bounds one caller).
    item_extract_rate_limit_threshold: int = 20
    item_extract_rate_limit_window_seconds: int = 3600
    # Global Claude calls per UTC day, across restarts + workers (DB-backed,
    # daily_usage_counters). 0 turns the reader off (503).
    wow_extract_daily_cap: int = 300

    # ------------------------------------------------------------------
    # WoW Forever feature requests (POST /wow/feature-requests — PUBLIC, both
    # modes). Claude refines an anonymous request into a user story; same
    # gating shape as the item reader (availability 503
    # ``feature_requests_unavailable`` → per-IP limits → Turnstile → inbox
    # guard → durable daily cap on its own bucket). No boot guard.
    # ------------------------------------------------------------------
    claude_feature_refiner_model: str = "claude-haiku-5-5"
    # Global Claude refinements per UTC day (daily_usage_counters). 0 = off (503).
    wow_feature_request_daily_cap: int = 100
    wow_feature_submit_rate_limit_per_hour: int = 5
    wow_feature_submit_rate_limit_per_day: int = 20
    wow_feature_vote_rate_limit_per_hour: int = 60
    # Shared secrets for the triage API (header X-MGA-Triage-Token), as
    # "label:token,label:token" (e.g. "browser:...,cli:..."; a bare token is
    # labelled "default"). Empty = the triage router is not mounted (404).
    # Labels [a-z0-9_-]{1,20}; each token >= 32 chars with >= 16 distinct
    # characters, or the app refuses to boot. Generate a token with
    #   python -c "import secrets;print(secrets.token_urlsafe(32))"
    wow_feature_triage_token: str = ""

    # ------------------------------------------------------------------
    # WoW Forever "Ask" chat relay (POST /wow/chat/turn — PUBLIC, both modes).
    # A stateless relay: the browser sends the conversation, the server adds
    # its own system prompt + fixed tools, calls Claude and returns the reply
    # with a signed ticket; the browser runs the tool calls against its
    # bundled game data. Same availability rule as the item reader (503
    # ``chat_unavailable`` without ANTHROPIC_API_KEY, with a cap <= 0, or —
    # serve-only / production — without TURNSTILE_SECRET_KEY). No boot guard.
    # ------------------------------------------------------------------
    claude_wow_chat_model: str = "claude-haiku-5-5"
    wow_chat_max_tokens: int = 800
    # Weighted Claude tokens per UTC day (input + 5 x output; cache reads
    # count 1/10), across restarts + workers (daily_usage_counters). 0 = off.
    wow_chat_daily_token_cap: int = 2_500_000
    # The same budget per network (IPv4 / IPv6 /64), keyed by an HMAC. 0 = off.
    wow_chat_ip_daily_token_cap: int = 250_000
    # In-process per-IP limits: new questions per hour / day, tool rounds per hour.
    wow_chat_turn_rate_limit_per_hour: int = 20
    wow_chat_turn_rate_limit_per_day: int = 60
    wow_chat_continuation_rate_limit_per_hour: int = 60

    # ------------------------------------------------------------------
    # Test-only helpers — never set in production.
    # When true, /api/_test/* endpoints are mounted (rate-limit reset,
    # seed lineup for E2E tests). Guarded by the mga_enable_test_helpers flag.
    # ------------------------------------------------------------------
    mga_enable_test_helpers: bool = False

    # ------------------------------------------------------------------
    # Discord bot (HTTP-interactions, no gateway — PR 2+).
    # Set DISCORD_ENABLED=true to activate; all three vars below become
    # required in production and the /discord/interactions route is mounted.
    # When false (the default) the route is absent (404) and none of the
    # Discord vars are read.
    # ------------------------------------------------------------------
    discord_enabled: bool = False
    # Application ID from the Discord Developer Portal → General Information.
    discord_application_id: str = ""
    # Public key (hex) from the Developer Portal — used to verify Ed25519
    # signatures on every incoming interaction.
    discord_public_key: str = ""
    # Bot token — used by the REST client (bulk_overwrite_*_commands, follow-ups).
    # Treat as a secret: never log it. Plain str matches the existing convention
    # in this codebase (all secrets are str, not SecretStr — see minio_secret_key
    # and turnstile_secret_key in BaseAppSettings).
    discord_bot_token: str = ""
    # Optional: register commands to a single guild for instant propagation in
    # dev (guild commands update in <1s vs ~1h for global). Set to the Discord
    # guild/server ID of your dev server. Leave empty to always register
    # globally.
    discord_dev_guild_id: str = ""

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
    # Optional: pass through to yt-dlp's --cookies-from-browser equivalent so
    # YouTube's "Sign in to confirm you're not a bot" challenges can be bypassed
    # using the operator's already-authenticated browser session. Accepts a
    # browser name yt-dlp supports — chrome, firefox, edge, safari, chromium,
    # opera, brave, vivaldi, whale. Empty (default) disables cookie injection,
    # which is the right shape for CI / fresh deploys where no browser exists.
    youtube_cookies_from_browser: str = ""
    # Optional: path to a Netscape cookies.txt file exported from a logged-in
    # YouTube session. Takes precedence over YOUTUBE_COOKIES_FROM_BROWSER when
    # set — bypasses Chrome's DPAPI encryption entirely (Chrome 127+ App-Bound
    # Encryption breaks yt-dlp's browser cookie extraction on Windows). Export
    # using a browser extension ("Get cookies.txt LOCALLY") and re-export every
    # few weeks when YouTube rotates the session. Empty (default) disables file
    # cookie injection and falls back to YOUTUBE_COOKIES_FROM_BROWSER.
    youtube_cookies_file: str = ""

    # ------------------------------------------------------------------
    # Pane-editor wide-source window (for the trim editor)
    # ------------------------------------------------------------------
    # Seconds of padding kept BEFORE the chapter when extracting the
    # ``*_url_original`` source clip the trim editor reads from. The operator
    # can drag the trim slider into this pre-chapter padding to grab frames
    # the original ingest cut left behind (typical use: 1-2s of approach /
    # setup that the chapter title misses).
    clip_source_pre_seconds: float = 7.5
    # Seconds of padding kept AFTER the chapter, symmetric to the pre-padding
    # above. Same purpose: lets the trim editor extend past the original
    # ingest cut. 7.5s mirrors the pre-padding so the editor's slider feels
    # symmetric around the chapter (15s total widen window — chapter ± 7.5s).
    clip_source_post_seconds: float = 7.5

    # ------------------------------------------------------------------
    # Scheduler (PR 6+)
    # ------------------------------------------------------------------
    # SCHEDULER_ENABLED turns the source jobs on/off: YouTube source sync,
    # download cleanup and the Discord raid reminders. Serve-only prod sets it
    # false so it never re-syncs sources. The WoW price refresh has its own
    # switch below, so prices keep refreshing with it off. In production, if
    # the scheduler fails to start, the lifespan fails loudly.
    scheduler_enabled: bool = True
    # Interval in hours between full source sync passes.
    # Each pass iterates all active sources sequentially.
    source_sync_interval_hours: int = 6
    # Hours between WoW Forever auction-house price refreshes (also runs once
    # at boot). TSM's files say max-age=4h; asking every 3h with a conditional
    # GET keeps prices at most ~3h behind and costs a 304 when nothing changed.
    wow_price_refresh_interval_hours: int = 3
    # WOW_PRICE_REFRESH_ENABLED — independent of SCHEDULER_ENABLED: the public
    # GET /wow/prices is empty without it. Tests and offline dev can turn it off.
    wow_price_refresh_enabled: bool = True
    # WOW_SERVER_STATUS_RECORDING_ENABLED — independent of SCHEDULER_ENABLED: the
    # server status history (GET /wow/server-status/history) is filled by a
    # 5-minute read-only call to Blizzard's public status page. Serve-only prod
    # keeps it on; tests and offline dev can turn it off. The 90-day purge of
    # the history runs either way.
    wow_server_status_recording_enabled: bool = True


    @field_validator("wow_feature_triage_token")
    @classmethod
    def _triage_tokens_valid(cls, value: str) -> str:
        """Fail loud at boot on a malformed or weak triage token list."""
        parse_triage_tokens(value)
        return value

    @property
    def wow_feature_triage_tokens(self) -> tuple[TriageToken, ...]:
        """The configured (label, token) pairs; empty when unset."""
        return parse_triage_tokens(self.wow_feature_triage_token)

settings = Settings()
