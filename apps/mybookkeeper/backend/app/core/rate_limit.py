"""In-memory rate limiter for auth and API endpoints."""
from platform_shared.core.rate_limit import RateLimiter, get_client_ip

from fastapi import HTTPException, Request

from app.core.config import settings
from app.services.user.turnstile_service import verify_turnstile_token

# App-specific rate limiter instances
login_limiter = RateLimiter(max_attempts=10, window_seconds=300)
totp_limiter = RateLimiter(max_attempts=20, window_seconds=300)
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
password_reset_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
export_limiter = RateLimiter(max_attempts=20, window_seconds=3600)
frontend_error_limiter = RateLimiter(max_attempts=50, window_seconds=3600)


async def check_login_rate_limit(request: Request) -> None:
    login_limiter.check(get_client_ip(request))


async def check_totp_rate_limit(request: Request) -> None:
    totp_limiter.check(get_client_ip(request))


async def check_password_reset_rate_limit(request: Request) -> None:
    password_reset_limiter.check(get_client_ip(request))


async def check_register_rate_limit(request: Request) -> None:
    register_limiter.check(get_client_ip(request))

    if settings.turnstile_secret_key:
        token = request.headers.get("X-Turnstile-Token", "")
        if not token:
            raise HTTPException(status_code=400, detail="Captcha token required")
        valid = await verify_turnstile_token(token, get_client_ip(request))
        if not valid:
            raise HTTPException(status_code=400, detail="Captcha verification failed")
