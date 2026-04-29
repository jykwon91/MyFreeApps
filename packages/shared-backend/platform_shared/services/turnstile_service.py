"""Cloudflare Turnstile CAPTCHA verification.

Pure verification helper — apps wire their own secret key (read from their own
config layer) and pass it to ``verify_turnstile_token``. When the secret is
empty (dev/CI mode) the verifier short-circuits to True so local development
does not require a Cloudflare account.
"""
import httpx

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TIMEOUT_S = 10


async def verify_turnstile_token(
    token: str,
    remote_ip: str | None = None,
    *,
    secret_key: str | None,
) -> bool:
    """Verify a Turnstile token against Cloudflare's siteverify endpoint.

    Returns True when ``secret_key`` is empty/None — the no-op dev mode.
    Otherwise POSTs to Cloudflare and returns ``result["success"]``.
    """
    if not secret_key:
        return True

    payload: dict[str, str] = {
        "secret": secret_key,
        "response": token,
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    async with httpx.AsyncClient(timeout=TURNSTILE_TIMEOUT_S) as client:
        resp = await client.post(TURNSTILE_VERIFY_URL, data=payload)
        result = resp.json()
        return result.get("success", False)
