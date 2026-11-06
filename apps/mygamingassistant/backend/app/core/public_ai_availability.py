"""Is an anonymous, Claude-backed public endpoint switched on?

Shared by the WoW item reader and WoW feature requests: both spend Claude money
with no login in serve-only prod, so both answer a runtime 503 (never a boot
failure) when the key, the daily cap or — on anonymous deployments — the
Turnstile secret is missing.
"""
from app.core.config import settings


def turnstile_required() -> bool:
    """Anonymous deployments must not expose a paid endpoint without a CAPTCHA."""
    return settings.serve_only or settings.environment == "production"


def missing_public_ai_config(*, daily_cap: int, cap_env_name: str) -> list[str]:
    """Env var names whose absence switches the endpoint off (empty = available)."""
    missing: list[str] = []
    if not settings.anthropic_api_key:
        missing.append("ANTHROPIC_API_KEY")
    if daily_cap <= 0:
        missing.append(cap_env_name)
    if turnstile_required() and not settings.turnstile_secret_key:
        missing.append("TURNSTILE_SECRET_KEY")
    return missing
